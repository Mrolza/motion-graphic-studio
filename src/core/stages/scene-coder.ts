import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema, type Storyboard, type StoryboardScene } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { generateJson } from '@core/llm/client';
import { computeStableHash, type RunLlmTracker } from '@core/llm/budget';
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

export class KitFaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KitFaultError';
  }
}

export interface SceneGenRecord {
  sceneId: string;
  fixes: number;
  passed: boolean;
  kitFault?: boolean;
  cached?: boolean;
  errors: string[];
  lineCount: number;
}

function collectQcErrors(qc: VisualQcResult): { errors: string[]; hasKitError: boolean } {
  const out: string[] = [];
  let hasKitError = false;
  for (const [layer, rep] of Object.entries(qc.reports)) {
    for (const iss of rep.issues) {
      if (iss.severity === 'error') {
        if (iss.owner === 'kit') hasKitError = true;
        out.push(`[${layer}${iss.owner ? `:${iss.owner}` : ''}] ${iss.ref ?? ''}: ${iss.message}`);
      }
    }
  }
  return { errors: out, hasKitError };
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
  const hudIds = sbScene.hud.map((h, i) => h.hud_id ?? `${sbScene.id}_H${i + 1}`);
  const hudTags = hudIds
    .map((id) => `          <Hud id="${id}" driver={driver} palette="blueprint-navy" />`)
    .join('\n');

  return `Tulis satu komponen adegan Remotion TSX bernama "${exportName}" (<= 220 baris) untuk adegan "${sbScene.id}" (shot_type: "${sbScene.shot_type ?? 'closeup'}").

Spesifikasi Storyboard:
${JSON.stringify(sbScene, null, 2)}

Narasi adegan ini:
"${narrationText}"

Waktu pemicu (triggerRelSec): ${triggerRelSec} detik (durasi gerak driver: ${driverDur} detik).

ATURAN MUTLAK:
1. HANYA impor dari 'react', 'remotion', dan '../../../kit'. Dilarang impor lain atau URL eksternal.
2. Wajib ekspor dan bungkus dengan StoryboardHudProvider + TelemetryProvider:
   export interface ${exportName}Props { telemetry?: boolean; hudData?: StoryboardHudDataItem[]; }
   export const ${exportName}: React.FC<${exportName}Props> = ({ telemetry = false, hudData = [] }) => (
     <TelemetryProvider enabled={telemetry}>
       <StoryboardHudProvider items={hudData}>
         <${exportName}Inner telemetry={telemetry} />
       </StoryboardHudProvider>
     </TelemetryProvider>
   );
3. Di dalam *Inner, panggil useDriver({ name: '${sbScene.driver?.name ?? 'progress'}', from: ${
    sbScene.driver?.from ?? 0
  }, to: ${sbScene.driver?.to ?? 1}, unit: '${
    sbScene.driver?.unit === 'deg' ? '°' : sbScene.driver?.unit ?? ''
  }', startSec: ${triggerRelSec}, durationSec: ${driverDur}, curve: 'linear' }).
4. Bungkus 3D + HUD dalam <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy"><BlueprintStage palette="blueprint-navy" telemetry={telemetry} hud={...}>...</BlueprintStage></SceneTransition>.
5. Pilih rakitan sesuai shot_type/focus_entities (CameraRig HANYA mendukung mode="frameEntities", DILARANG mode="follow" dan DILARANG menyetel from/to/radius/height manual! Jika memakai curveRadius, hitung const wl = computeWheelsetLayout({ distance: driver.value, curveStartZ: 2, curveRadius: 10 }); agar focusBox mengikuti tikungan):
   - "train_car" (establishing/summary): hitung const distM = driver.unit === '%' ? -2 + driver.progress * 6 : driver.value; lalu <CurvedRail startZ={-10} curveStartZ={2} curveRadius={10} curveLength={18} gauge={1.435} highlighted palette="blueprint-navy" /> + <Ground size={60} divisions={60} y={0} /> + <TrainCar entityId="train_car" distance={distM} curveStartZ={2} curveRadius={10} palette="blueprint-navy" />, CameraRig mode="frameEntities" focusBox={{ center: wl.center, size: [2.2, 2.0, 4.4] }} padding={1.22} startAngleDeg={-22} endAngleDeg={22} (gunakan distM pada computeWheelsetLayout!).
   - "rail_cross_section" (cross_section): <Ground size={40} divisions={40} y={0} /> + <RailCrossSection entityId="rail_cross_section" view="section" lateralShift={driver.name.toLowerCase().includes('lateral') || driver.name.toLowerCase().includes('shift') ? driver.value : 0.045 * Math.sin(driver.progress * Math.PI)} taperExaggeration={12} palette="blueprint-navy" />, CameraRig mode="frameEntities" focusBox={{ center: [0, 0.55, 0], size: [1.9, 1.15, 0.35] }} padding={1.15} startAngleDeg={0} endAngleDeg={0} elevationDeg={2}. WAJIB sertakan <ExaggerationBadge factor={12} palette="blueprint-navy" /> di dalam <HudLayout>!
   - "wheelset": <CurvedRail startZ={-10} curveStartZ={2} curveRadius={10} curveLength={18} gauge={1.435} highlighted palette="blueprint-navy" /> + <Ground size={60} divisions={60} y={0} /> + <WheelsetOnRail entityId="wheelset" distance={driver.value} taperExaggeration={4.5} curveStartZ={2} curveRadius={10} highlightContact palette="blueprint-navy" />, CameraRig mode="frameEntities" focusBox={{ center: wl.center, size: [1.9, 1.25, 1.6] }} padding={1.25} elevationDeg={22}.
   - "engine_block" (establishing/summary/cutaway): <Ground size={36} divisions={36} y={-0.55} /> + <EngineBlock entityId="engine_block" crankAngleDeg={driver.value} cutawayProgress={driver.progress} position={[0, 0.45, 0]} palette="blueprint-navy" />, CameraRig mode="frameEntities" focusBox={{ center: [0, 1.72, 0], size: [2.05, 3.15, 2.05] }} padding={1.25}.
   - "piston_crank": <Ground size={36} divisions={36} y={-0.55} /> + <PistonCrankAssembly entityId="piston_crank" crankAngleDeg={driver.value} position={[0, 0.45, 0]} cutaway palette="blueprint-navy" />, CameraRig mode="frameEntities" focusBox={{ center: [0, 1.72, 0], size: [1.35, 3.15, 1.35] }} padding={1.22} elevationDeg={12}.
6. DILARANG menulis teks HUD langsung atau memanggil KineticTitle/Callout/MeasureReveal/StatCounter/CompareCard langsung!
   Di prop hud={<HudLayout palette="blueprint-navy"><HudZone zone="callout" palette="blueprint-navy">...</HudZone></HudLayout>} (HudZone HANYA menerima zone="title" atau zone="callout", DILARANG "footer"), HANYA gunakan:
${hudTags}
   Catatan DiagramOverlay: <DiagramOverlay curveArc inertiaArrow /> adalah elemen SVG 2D! Jika shot_type="diagram_overlay", taruh <DiagramOverlay curveArc inertiaArrow /> sebagai anak langsung dari <HudLayout> (di dalam prop hud={...}), DILARANG menaruh <DiagramOverlay> di dalam children 3D <BlueprintStage> (akan crash Three.js R3F)!

${KIT_SUMMARY_FOR_LLM}

Kembalikan JSON { "tsx": "..." }.`;
}

export async function runScenesStage(
  projectId: string,
  repoRoot = process.cwd(),
  options?: {
    tracker?: RunLlmTracker;
    generateJsonFn?: typeof generateJson;
    runVisualQcFn?: typeof runVisualQc;
    skipTscAndRegistry?: boolean;
  }
): Promise<SceneGenRecord[]> {
  const llm = options?.generateJsonFn ?? generateJson;
  const runQc = options?.runVisualQcFn ?? runVisualQc;
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  if (project.stages.S7 !== 'done') {
    throw new Error(
      `BLOCKED: Storyboard QC (S7) untuk "${projectId}" belum lolos (status=${project.stages.S7}). Perbaiki storyboard sebelum menjalankan Scene Coder.`
    );
  }
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
  const ledger = JSON.parse(await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const storyboard = StoryboardSchema.parse(
    JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8'))
  );

  const scriptMap = new Map(script.scenes.map((s) => [s.id, s]));
  const metas: GeneratedCompMeta[] = [];
  const records: SceneGenRecord[] = [];
  const kitApi = await readFile(path.join(repoRoot, 'remotion', 'src', 'kit', 'KIT-API.md'), 'utf-8').catch(() => '');
  const cachePath = path.join(projScenesDir, 'cache.json');
  const sceneCache: Record<string, { hash: string; passed: boolean }> = JSON.parse(
    await readFile(cachePath, 'utf-8').catch(() => '{}')
  );
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
      const sceneHash = computeStableHash({ sbScene, kitApi, promptVersion: 'p4b-v1' });
      const tsxPath = path.join(genDir, `${sbScene.id}.tsx`);

      if (sceneCache[sbScene.id]?.hash === sceneHash && sceneCache[sbScene.id]?.passed === true) {
        const existingCode = await readFile(tsxPath, 'utf-8').catch(() => '');
        if (existingCode) {
          metas.push({ id: compId, importPath: `./${sbScene.id}`, exportName, durationInFrames: frames });
          records.push({
            sceneId: sbScene.id,
            fixes: 0,
            passed: true,
            cached: true,
            errors: [],
            lineCount: existingCode.split(/\r?\n/).length,
          });
          continue;
        }
      }

      const basePrompt = buildScenePrompt({
        projectId: safeSlug,
        sbScene,
        narrationText,
        triggerRelSec,
        exportName,
      });

      const genRes = await llm(SceneCodeOutputSchema, basePrompt, {
        stage: 'S8',
        purpose: 'scene_gen',
        sceneId: sbScene.id,
        tracker: options?.tracker,
        onCallRecord: () => {
          s8Calls++;
        },
      });

      let code = genRes.data.tsx.trim();
      await writeFile(path.join(projScenesDir, `${sbScene.id}.raw.tsx`), code, 'utf-8');

      metas.push({
        id: compId,
        importPath: `./${sbScene.id}`,
        exportName,
        durationInFrames: frames,
      });

      let fixes = 0;
      let lastErrors: string[] = [];
      let passed = false;
      let kitFault = false;

      for (let attempt = 0; attempt <= 2; attempt++) {
        await writeFile(tsxPath, code, 'utf-8');
        await writeFile(path.join(genDir, 'meta.json'), JSON.stringify(metas, null, 2), 'utf-8');
        if (!options?.skipTscAndRegistry) {
          await syncGeneratedRegistry(repoRoot);
          clearRemotionBundleCache();
        }

        const safety = validateSceneCodeSafety(code);
        if (!safety.ok) {
          lastErrors = safety.errors;
        } else {
          const tsc = options?.skipTscAndRegistry
            ? { ok: true, errorText: '' }
            : await runRemotionTscForFile(repoRoot, `${safeSlug}/${sbScene.id}.tsx`);
          if (!tsc.ok) {
            lastErrors = [`TSC_ERROR: ${tsc.errorText.slice(0, 600)}`];
          } else {
            const spec = buildVisualSpecForScene(compId, sbScene, triggerRelSec, ledger);
            const hudData = sbScene.hud.map((h, idx) => ({
              ...h,
              hud_id: h.hud_id ?? `${sbScene.id}_H${idx + 1}`,
            }));
            const qc = await runQc({
              spec,
              outputDir: path.join(projQcDir, sbScene.id),
              videoOutPath: path.join(projQcDir, sbScene.id, `_tmp_${sbScene.id}.mp4`),
              inputProps: { hudData },
              deviceProfile: project.device_profile,
              repoRoot,
            });
            const collected = collectQcErrors(qc);
            lastErrors = collected.errors;
            if (qc.passed) {
              passed = true;
              break;
            }
            if (collected.hasKitError) {
              kitFault = true;
              break;
            }
          }
        }

        if (attempt < 2) {
          fixes++;
          const fixRes = await llm(
            SceneCodeOutputSchema,
            `Perbaiki kode TSX adegan "${sbScene.id}" berikut karena gagal validasi:\n${lastErrors
              .map((e) => `- ${e}`)
              .join('\n')}\n\nKode saat ini:\n${code}\n\nPastikan mematuhi semua aturan Scene Kit dan batas <= 300 baris. Kembalikan JSON { "tsx": "..." }.`,
            {
              stage: 'S9',
              purpose: 'scene_fix',
              sceneId: sbScene.id,
              tracker: options?.tracker,
              onCallRecord: () => {
                s9Calls++;
              },
            }
          );
          code = fixRes.data.tsx.trim();
        }
      }

      await writeFile(path.join(projScenesDir, `${sbScene.id}.final.tsx`), code, 'utf-8');
      sceneCache[sbScene.id] = { hash: sceneHash, passed };
      await writeFile(cachePath, JSON.stringify(sceneCache, null, 2), 'utf-8');
      records.push({
        sceneId: sbScene.id,
        fixes,
        passed,
        kitFault,
        errors: lastErrors,
        lineCount: code.split(/\r?\n/).length,
      });

      if (kitFault) {
        await writeFile(path.join(projScenesDir, 'summary.json'), JSON.stringify(records, null, 2), 'utf-8');
        throw new KitFaultError(`KIT_FAULT: ${sbScene.id} gagal karena kesalahan milik kit (${lastErrors[0]})`);
      }
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
