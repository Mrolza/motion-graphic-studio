import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { generateJson } from '@core/llm/client';
import {
  getProjectDir,
  incrementProjectLlmCalls,
  loadProject,
  saveProject,
} from '@core/project/store';

export const ConceptSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  angle: z.string().min(1),
  hook: z.string().min(1),
  core_claims: z.array(z.string().min(1)).min(3).max(5),
  search_queries: z.array(z.string().min(1)).min(2).max(6),
});

export const ConceptsOutputSchema = z.object({
  concepts: z.array(ConceptSchema).length(3),
});

export type Concept = z.infer<typeof ConceptSchema>;
export type ConceptsOutput = z.infer<typeof ConceptsOutputSchema>;

export async function runIdeateStage(
  projectId: string,
  repoRoot = process.cwd()
): Promise<ConceptsOutput> {
  const project = await loadProject(projectId, repoRoot);
  project.stages.S1 = 'running';
  await saveProject(project, repoRoot);

  const systemInstruction = `Anda adalah perancang konsep video pendek edukasi berbasis fakta.
Buat tepat 3 konsep berbeda untuk topik dan format yang diberikan.
Aturan ketat:
- Hindari mitos populer dan klaim yang tidak bisa diverifikasi di Wikipedia.
- Setiap konsep wajib memiliki 3-5 core_claims faktual yang konkret dan dapat diverifikasi.
- Untuk format what_if, premis boleh hipotetis tetapi core_claims HARUS fakta ilmiah nyata yang mendasari skenario tersebut.
- search_queries wajib berisi kata kunci pencarian Wikipedia dalam bahasa Indonesia dan Inggris (2-6 query).
- Kembalikan JSON sesuai skema: { "concepts": [{ "id": "C1", "title": "...", "angle": "...", "hook": "...", "core_claims": ["..."], "search_queries": ["..."] }] }.`;

  const prompt = `Topik: "${project.topic}"
Format: ${project.format}
Target durasi: ${project.target_duration_sec} detik

Hasilkan 3 konsep.`;

  let llmCallsThisRun = 0;
  try {
    const res = await generateJson(ConceptsOutputSchema, prompt, {
      stage: 'S1',
      systemInstruction,
      onCallRecord: () => {
        llmCallsThisRun++;
      },
    });

    const outPath = path.join(getProjectDir(projectId, repoRoot), 'concepts.json');
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(res.data, null, 2), 'utf-8');

    await incrementProjectLlmCalls(projectId, 'S1', llmCallsThisRun, repoRoot);
    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S1 = 'done';
    await saveProject(updated, repoRoot);
    return res.data;
  } catch (err) {
    if (llmCallsThisRun > 0) {
      await incrementProjectLlmCalls(projectId, 'S1', llmCallsThisRun, repoRoot).catch(() => {});
    }
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S1 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}
