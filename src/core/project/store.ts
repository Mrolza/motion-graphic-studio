import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ALL_STAGES,
  ProjectSchema,
  type DeviceProfileName,
  type Project,
  type StageId,
  type StageStatus,
  type VideoFormat,
  type VisualStyle,
} from '@core/contracts/project';

export function slugifyTopic(topic: string): string {
  const base = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${base || 'project'}-${stamp}`;
}

export function getProjectDir(id: string, repoRoot = process.cwd()): string {
  return path.join(repoRoot, 'projects', id);
}

export function getProjectJsonPath(id: string, repoRoot = process.cwd()): string {
  return path.join(getProjectDir(id, repoRoot), 'project.json');
}

export async function createProject(
  input: {
    id?: string;
    topic: string;
    format: VideoFormat;
    style: VisualStyle;
    palette?: string;
    target_duration_sec?: number;
    device_profile?: DeviceProfileName;
  },
  repoRoot = process.cwd()
): Promise<Project> {
  const id = input.id || slugifyTopic(input.topic);
  const stages = Object.fromEntries(ALL_STAGES.map((s) => [s, 'pending'])) as Record<
    StageId,
    StageStatus
  >;
  const llm_calls = Object.fromEntries(ALL_STAGES.map((s) => [s, 0])) as Record<StageId, number>;
  const llm_calls_last_run = Object.fromEntries(ALL_STAGES.map((s) => [s, 0])) as Record<
    StageId,
    number
  >;

  const project: Project = ProjectSchema.parse({
    id,
    created_at: new Date().toISOString(),
    topic: input.topic,
    format: input.format,
    style: input.style,
    palette: input.palette ?? 'blueprint-navy',
    target_duration_sec: input.target_duration_sec ?? 45,
    device_profile: input.device_profile ?? 'standar',
    stages,
    llm_calls,
    llm_calls_last_run,
  });

  const dir = getProjectDir(id, repoRoot);
  await mkdir(dir, { recursive: true });
  await writeFile(getProjectJsonPath(id, repoRoot), JSON.stringify(project, null, 2), 'utf-8');
  return project;
}

export async function loadProject(id: string, repoRoot = process.cwd()): Promise<Project> {
  const raw = await readFile(getProjectJsonPath(id, repoRoot), 'utf-8');
  return ProjectSchema.parse(JSON.parse(raw));
}

export async function saveProject(project: Project, repoRoot = process.cwd()): Promise<void> {
  const validated = ProjectSchema.parse(project);
  const filePath = getProjectJsonPath(validated.id, repoRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(validated, null, 2), 'utf-8');
}

export async function resetProjectLastRunCalls(
  id: string,
  stage?: StageId,
  repoRoot = process.cwd()
): Promise<Project> {
  const project = await loadProject(id, repoRoot);
  const lastRun =
    project.llm_calls_last_run ??
    (Object.fromEntries(ALL_STAGES.map((s) => [s, 0])) as Record<StageId, number>);
  if (stage) {
    lastRun[stage] = 0;
  } else {
    for (const s of ALL_STAGES) lastRun[s] = 0;
  }
  project.llm_calls_last_run = lastRun;
  await saveProject(project, repoRoot);
  return project;
}

export async function incrementProjectLlmCalls(
  id: string,
  stage: StageId,
  count = 1,
  repoRoot = process.cwd()
): Promise<Project> {
  const project = await loadProject(id, repoRoot);
  project.llm_calls[stage] = (project.llm_calls[stage] ?? 0) + count;
  const lastRun =
    project.llm_calls_last_run ??
    (Object.fromEntries(ALL_STAGES.map((s) => [s, 0])) as Record<StageId, number>);
  lastRun[stage] = (lastRun[stage] ?? 0) + count;
  project.llm_calls_last_run = lastRun;
  await saveProject(project, repoRoot);
  return project;
}
