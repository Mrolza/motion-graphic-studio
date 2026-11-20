import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema, type Storyboard, type StoryboardScene } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { generateJson } from '@core/llm/client';
import { getProjectDir, incrementProjectLlmCalls, loadProject, saveProject } from '@core/project/store';
import { clearRemotionBundleCache, runVisualQc } from '@core/qc/visual/runner';
import type { VisualQcResult } from '@core/qc/visual/types';
import { syncGeneratedRegistry, type GeneratedCompMeta } from './scene-registry';
import { buildVisualSpecForScene, findTriggerTimeInScene, validateSceneCodeSafety } from './scene-safety';
import { KIT_SUMMARY_FOR_LLM } from './storyboard';

const execFileAsync = promisify(execFile);
const SceneCodeOutputSchema = z.object({
  tsx: z.string().min(40),
});

export interface SceneGenRecord {
  sceneId: string;
  fixes: number;
  passed: boolean;
  errors: string[];
  lineCount: number;
}

function collectQcErrors(qc: VisualQcResult): string[] {
  const out: string[] = [];
  for (const [layer, rep] of Object.entries(qc.reports)) {
    for (const iss of rep.issues) {
      if (iss.severity === 'error') {
        out.push(`[${layer}] ${iss.ref ?? ''}: ${iss.message}`);
      }
    }
  }
  return out;
}

async function runRemotionTscForFile(
  repoRoot: string,
  targetFileSuffix: string
): Promise<{ ok: boolean; errorText: string }> {
  try {
    await execFileAsync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['--prefix', 'remotion', 'run', 'typecheck'],
      { cwd: repoRoot, shell: process.platform === 'win32' }
    );
    return { ok: true, errorText: '' };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const full = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim() || String(err);
    const hasTargetErr = full.includes(targetFileSuffix);
    if (!hasTargetErr) return { ok: true, errorText: '' };
    const relevantLines = full.split(/\r?\n/).filter((l) => l.includes(targetFileSuffix));
    return { ok: false, errorText: relevantLines.join('\n') || full };
  }
}

function buildScenePrompt(params: {
  projectId: string;
  sbScene: StoryboardScene;
  narrationText: string;
  triggerRelSec: number;
  exportName: string;
}): string {
  const { sbScene, narrationText, triggerRelSec, exportName } = params;
  const driverDur = Math.max(0.5, Number((sbScene.duration_sec - triggerRelSec).toFixed(2)));
  return `Tulis satu komponen adegan Remotion TSX bernama "${exportName}" (<= 220 baris) untuk adegan "${sbScene.id}".

Spesifikasi Storyboard:
${JSON.stringify(sbScene, null, 2)}

Narasi adegan ini:
"${narrationText}"

Waktu pemicu (triggerRelSec): ${triggerRelSec} detik (durasi gerak driver: ${driverDur} detik).

ATURAN MUTLAK:
1. HANYA impor dari 'react', 'remotion', dan '../../../kit'. Dilarang impor lain atau URL eksternal.
2. Wajib ekspor:
   export interface ${exportName}Props { telemetry?: boolean; }
   export const ${exportName}: React.FC<${exportName}Props> = ({ telemetry = false }) => (
     <TelemetryProvider enabled={telemetry}>
       <${exportName}Inner />
     </TelemetryProvider>
   );
3. Di dalam *Inner, panggil useDriver({ name: '${sbScene.driver?.name ?? 'progress'}', from: ${
    sbScene.driver?.from ?? 0
  }, to: ${sbScene.driver?.to ?? 1}, unit: '${sbScene.driver?.unit ?? ''}', startSec: ${triggerRelSec}, durationSec: ${driverDur}, curve: 'linear' }).
4. Bungkus 3D + HUD dalam <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy"><BlueprintStage palette="blueprint-navy" telemetry={telemetry} hud={...}>...</BlueprintStage></SceneTransition>.
5. Gunakan <CameraRig mode="frameEntities" framing="portrait-lower" ... /> agar entitas fokus berada di zona bebas tengah layar:
   - Jika memakai WheelsetOnRail: gunakan <CurvedRail startZ={-10} curveStartZ={2} curveRadius={10} curveLength={18} gauge={1.435} highlighted palette="blueprint-navy" /> + <Ground size={60} divisions={60} y={0} />, WheelsetOnRail entityId="wheelset" taperExaggeration={4.5} highlightContact, CameraRig focusBox={{ center: [0, 0.7, driver.value], size: [1.9, 1.25, 1.6] }} padding={1.85} elevationDeg={24}.
   - Jika memakai PistonCrankAssembly: gunakan <Ground size={36} divisions={36} y={-0.55} />, PistonCrankAssembly entityId="piston_crank" crankAngleDeg={driver.value} position={[0, 0.45, 0]} cutaway, CameraRig focusBox={{ center: [0, 1.65, 0], size: [1.5, 2.75, 1.5] }} padding={1.18} elevationDeg={10}.
6. Di <HudLayout palette="blueprint-navy">:
   - <HudZone zone="title"><KineticTitle id="title_${sbScene.id}" title="..." palette="blueprint-navy" /></HudZone>
   - <HudZone zone="callout">: MAKSIMAL 2 panel HUD (jangan bocorkan "(C1)"/"(C2)" di teks layar; angka pakai format id-ID seperti 1:20, 1.435, 3,5, 68°).
   - CONTOH PROPS HUD YANG BENAR (JANGAN pakai children pada Callout, JANGAN pakai title/content pada Callout):
     <MeasureReveal id="m1" label="Kemiringan" valueText="1:20" claimRef="C1" palette="blueprint-navy" />
     <Callout id="c1" label="Judul Singkat" detail="Penjelasan singkat" claimRef="C1" palette="blueprint-navy" />
     <StatCounter id="s1" label="Sudut Engkol" driver={driver} bindToDriver palette="blueprint-navy" />
     <CompareCard id="cmp1" leftTitle="Roda Dalam" leftValue="Kecil" rightTitle="Roda Luar" rightValue="Besar" palette="blueprint-navy" />

${KIT_SUMMARY_FOR_LLM}

Kembalikan JSON { "tsx": "..." }.`;
}

export async function runScenesStage(
  projectId: string,
  repoRoot = process.cwd()
): Promise<SceneGenRecord[]> {
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  project.stages.S8 = 'running';
  project.stages.S9 = 'running';
  await saveProject(project, repoRoot);

  const safeSlug = projectId.replace(/[^a-zA-Z0-9-]/g, '-');
  const genDir = path.join(repoRoot, 'remotion', 'src', 'scenes', 'generated', safeSlug);
  const projScenesDir = path.join(projectDir, 'scenes');
  const projQcDir = path.join(projectDir, 'qc');
  await mkdir(genDir, { recursive: true });
  await mkdir(projScenesDir, { recursive: true });
  await mkdir(projQcDir, { recursive: true });

  const script = JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8')) as Script;
  const timeline = JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8')) as Timeline;
  const storyboard = StoryboardSchema.parse(
    JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8'))
  );

  const scriptMap = new Map(script.scenes.map((s) => [s.id, s]));
  const metas: GeneratedCompMeta[] = [];
  const records: SceneGenRecord[] = [];
  let s8Calls = 0;
  let s9Calls = 0;

  try {
    for (const sbScene of storyboard.scenes) {
      const exportName = `Scene_${sbScene.id.replace(/[^a-zA-Z0-9]/g, '')}`;
      const compId = `gen-${safeSlug}-${sbScene.id}`;
      const frames = Math.max(15, Math.round(sbScene.duration_sec * 30));
      const scScene = scriptMap.get(sbScene.id);
      const narrationText = scScene?.sentences.map((s) => s.text).join(' ') ?? '';
      const triggerRelSec = findTriggerTimeInScene(sbScene.id, sbScene.trigger_words, timeline);

      const basePrompt = buildScenePrompt({
        projectId: safeSlug,
        sbScene,
        narrationText,
        triggerRelSec,
        exportName,
      });

      const genRes = await generateJson(SceneCodeOutputSchema, basePrompt, {
        stage: 'S8',
        onCallRecord: () => {
          s8Calls++;
        },
      });

      let code = genRes.data.tsx.trim();
      await writeFile(path.join(projScenesDir, `${sbScene.id}.raw.tsx`), code, 'utf-8');

      const tsxPath = path.join(genDir, `${sbScene.id}.tsx`);
      metas.push({
        id: compId,
        importPath: `./${sbScene.id}`,
        exportName,
        durationInFrames: frames,
      });

      let fixes = 0;
      let lastErrors: string[] = [];
      let passed = false;

      for (let attempt = 0; attempt <= 2; attempt++) {
        await writeFile(tsxPath, code, 'utf-8');
        await writeFile(path.join(genDir, 'meta.json'), JSON.stringify(metas, null, 2), 'utf-8');
        await syncGeneratedRegistry(repoRoot);
        clearRemotionBundleCache();

        const safety = validateSceneCodeSafety(code);
        if (!safety.ok) {
          lastErrors = safety.errors;
        } else {
          const tsc = await runRemotionTscForFile(repoRoot, `${safeSlug}/${sbScene.id}.tsx`);
          if (!tsc.ok) {
            lastErrors = [`TSC_ERROR: ${tsc.errorText.slice(0, 600)}`];
          } else {
            const spec = buildVisualSpecForScene(compId, sbScene, triggerRelSec);
            const qc = await runVisualQc({
              spec,
              outputDir: path.join(projQcDir, sbScene.id),
              videoOutPath: path.join(projQcDir, sbScene.id, `_tmp_${sbScene.id}.mp4`),
              deviceProfile: project.device_profile,
              repoRoot,
            });
            lastErrors = collectQcErrors(qc);
            if (qc.passed) {
              passed = true;
              break;
            }
          }
        }

        if (attempt < 2) {
          fixes++;
          const fixRes = await generateJson(
            SceneCodeOutputSchema,
            `Perbaiki kode TSX adegan "${sbScene.id}" berikut karena gagal validasi:\n${lastErrors
              .map((e) => `- ${e}`)
              .join('\n')}\n\nKode saat ini:\n${code}\n\nPastikan mematuhi semua aturan Scene Kit dan batas <= 300 baris. Kembalikan JSON { "tsx": "..." }.`,
            {
              stage: 'S9',
              onCallRecord: () => {
                s9Calls++;
              },
            }
          );
          code = fixRes.data.tsx.trim();
        }
      }

      await writeFile(path.join(projScenesDir, `${sbScene.id}.final.tsx`), code, 'utf-8');
      records.push({
        sceneId: sbScene.id,
        fixes,
        passed,
        errors: lastErrors,
        lineCount: code.split(/\r?\n/).length,
      });
    }

    await writeFile(path.join(projScenesDir, 'summary.json'), JSON.stringify(records, null, 2), 'utf-8');
    if (s8Calls > 0) await incrementProjectLlmCalls(projectId, 'S8', s8Calls, repoRoot);
    if (s9Calls > 0) await incrementProjectLlmCalls(projectId, 'S9', s9Calls, repoRoot);

    const updated = await loadProject(projectId, repoRoot);
    const allPassed = records.every((r) => r.passed);
    updated.stages.S8 = 'done';
    updated.stages.S9 = allPassed ? 'done' : 'needs_review';
    await saveProject(updated, repoRoot);
    return records;
  } catch (err) {
    if (s8Calls > 0) await incrementProjectLlmCalls(projectId, 'S8', s8Calls, repoRoot).catch(() => {});
    if (s9Calls > 0) await incrementProjectLlmCalls(projectId, 'S9', s9Calls, repoRoot).catch(() => {});
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S8 = 'failed';
    failed.stages.S9 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}
