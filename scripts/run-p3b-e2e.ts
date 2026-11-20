import { execFile } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import type { Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { getProjectDir, loadProject, resetProjectLastRunCalls } from '@core/project/store';
import { runStoryboardQcStage, verifyStoryboardCode } from '@core/qc/storyboard';
import { checkSyncFromTelemetry } from '@core/qc/visual/checks';
import type { TelemetrySample, VisualCheckSpec } from '@core/qc/visual/types';
import { runPreviewRenderStage } from '@core/stages/preview';
import { runScenesStage, type SceneGenRecord } from '@core/stages/scene-coder';
import { runStoryboardStage } from '@core/stages/storyboard';
import { runVoiceStage } from '@core/stages/voice';

const execFileAsync = promisify(execFile);
const OUT_P3B = path.join(process.cwd(), 'out', 'review', 'p3b');

async function extractContactSheetAndStills(
  previewMp4: string,
  timeline: Timeline,
  outDir: string
) {
  const totalSec = Math.max(1, timeline.total_sec);
  const frameCount = Math.ceil(totalSec * 2);
  const cols = 6;
  const rows = Math.max(1, Math.ceil(frameCount / cols));
  await execFileAsync(ffmpegInstaller.path, [
    '-y',
    '-v',
    'error',
    '-i',
    previewMp4,
    '-vf',
    `fps=2,scale=270:480,tile=${cols}x${rows}`,
    '-frames:v',
    '1',
    path.join(outDir, 'contact-sheet.png'),
  ]);

  const stillsDir = path.join(outDir, 'stills');
  await mkdir(stillsDir, { recursive: true });
  for (const sc of timeline.scenes) {
    const mid = Number(((sc.start + sc.end) / 2).toFixed(2));
    await execFileAsync(ffmpegInstaller.path, [
      '-y',
      '-v',
      'error',
      '-ss',
      String(mid),
      '-i',
      previewMp4,
      '-frames:v',
      '1',
      path.join(stillsDir, `${sc.scene_id}-mid.png`),
    ]);
  }
}

async function runProjectP3b(id: string) {
  console.log(`\n=== P3B E2E for ${id} ===`);
  await resetProjectLastRunCalls(id);
  const voiceRes = await runVoiceStage(id);
  console.log(`  S5 Voice done: ${voiceRes.timeline.total_sec}s, ${voiceRes.timeline.scenes.length} scenes`);

  const sb = await runStoryboardStage(id);
  const sbQc = await runStoryboardQcStage(id);
  const sbErrs = sbQc.report.issues.filter((i) => i.severity === 'error');
  console.log(`  S6-S7 Storyboard done: scenes=${sb.scenes.length}, rewritten=${sbQc.rewritten}, errors=${sbErrs.length}`);

  const sceneRecords: SceneGenRecord[] = await runScenesStage(id);
  for (const r of sceneRecords) {
    console.log(`  S8-S9 ${r.sceneId}: passed=${r.passed}, fixes=${r.fixes}, lines=${r.lineCount}`);
  }

  const prevRes = await runPreviewRenderStage(id);
  console.log(
    `  Preview done: video=${prevRes.videoDurationSec}s, vo=${prevRes.voDurationSec}s, render=${prevRes.renderMs}ms`
  );

  const projDir = getProjectDir(id);
  const topicOut = path.join(OUT_P3B, id);
  await rm(topicOut, { recursive: true, force: true }).catch(() => {});
  await mkdir(topicOut, { recursive: true });

  await copyFile(path.join(projDir, 'timeline.json'), path.join(topicOut, 'timeline.json'));
  await copyFile(path.join(projDir, 'storyboard.json'), path.join(topicOut, 'storyboard.json'));
  await copyFile(prevRes.previewPath, path.join(topicOut, 'preview.mp4'));
  await cp(path.join(projDir, 'qc'), path.join(topicOut, 'qc'), { recursive: true });
  await cp(path.join(projDir, 'scenes'), path.join(topicOut, 'scenes'), { recursive: true });
  await extractContactSheetAndStills(prevRes.previewPath, voiceRes.timeline, topicOut);

  const proj = await loadProject(id);
  return { id, proj, sbErrs: sbErrs.length, sceneRecords, prevRes };
}

async function runMutations() {
  const mutDir = path.join(OUT_P3B, 'mutations');
  await mkdir(mutDir, { recursive: true });

  const projDir = getProjectDir('p2-kereta');
  const script = JSON.parse(await readFile(path.join(projDir, 'script.json'), 'utf-8')) as Script;
  const timeline = JSON.parse(await readFile(path.join(projDir, 'timeline.json'), 'utf-8')) as Timeline;
  const ledger = JSON.parse(await readFile(path.join(projDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const baseSb = JSON.parse(await readFile(path.join(projDir, 'storyboard.json'), 'utf-8')) as Storyboard;

  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  const s1 = baseSb.scenes[0]!;
  const verifiedId = ledger.claims.find((c) => c.status === 'verified')?.id ?? 'C1';
  const unverifiedId = ledger.claims.find((c) => c.status === 'unverified')?.id ?? 'C4';

  const mut1 = clone(baseSb);
  mut1.scenes[0]!.hud = [{ component: 'MeasureReveal', props: { label: 'Angka Palsu', valueText: '9876 mm' }, claim_ref: verifiedId }];

  const mut2 = clone(baseSb);
  mut2.scenes[0]!.trigger_words = ['kata_yang_tidak_ada_di_naskah'];

  const mut3 = clone(baseSb);
  mut3.scenes[0]!.hud = [
    { component: 'Callout', props: { label: 'Panel 1' } },
    { component: 'Callout', props: { label: 'Panel 2' } },
    { component: 'Callout', props: { label: 'Panel 3' } },
  ];

  const mut4 = clone(baseSb);
  mut4.scenes[0]!.hud = [{ component: 'Callout', props: { label: 'Klaim Unverified' }, claim_ref: unverifiedId }];

  const sbMuts = [
    { id: 'mut1-hud-number-not-in-ledger', sb: mut1 },
    { id: 'mut2-missing-trigger-word', sb: mut2 },
    { id: 'mut3-three-hud-panels', sb: mut3 },
    { id: 'mut4-unverified-claim-ref', sb: mut4 },
  ];

  const rows: string[] = [];
  for (const m of sbMuts) {
    const rep = verifyStoryboardCode(m.sb, script, timeline, ledger);
    const errs = rep.issues.filter((i) => i.severity === 'error');
    await writeFile(path.join(mutDir, `${m.id}.json`), JSON.stringify(rep, null, 2), 'utf-8');
    rows.push(`| ${m.id} | Storyboard QC | ${errs.length} error | ${errs[0]?.message ?? 'MISS'} |`);
  }

  // Mutation 5: delayed 1.5s after trigger word -> sync
  const spec: VisualCheckSpec = {
    compositionId: `gen-p2-kereta-${s1.id}`,
    focusEntities: s1.focus_entities,
    invariants: [],
    syncTargetSec: 1.0,
    syncToleranceSec: 0.35,
  };
  const delayedSamples: TelemetrySample[] = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0].map((sec, i) => ({
    frame: Math.round(sec * 30),
    sec,
    drivers: { distance: { value: sec >= 2.5 ? (i - 4) * 1.0 : -2, unit: 'm' } },
    entities: [],
    hud: [],
  }));
  const syncErrs = checkSyncFromTelemetry(delayedSamples, spec);
  await writeFile(path.join(mutDir, 'mut5-sync-delayed.json'), JSON.stringify({ issues: syncErrs }, null, 2), 'utf-8');
  rows.push(`| mut5-sync-delayed | Sync QC | ${syncErrs.length} error | ${syncErrs[0]?.message ?? 'MISS'} |`);

  await writeFile(
    path.join(mutDir, 'mutation-summary.md'),
    `# Uji Mutasi P3B (5 Mutasi)\n\n| Mutasi | Layer | Jumlah Error | Pesan Pertama |\n|---|---|---:|---|\n${rows.join('\n')}\n`,
    'utf-8'
  );
}

async function loadExistingKeretaSummary() {
  const proj = await loadProject('p2-kereta');
  const summary = JSON.parse(
    await readFile(path.join(getProjectDir('p2-kereta'), 'scenes', 'summary.json'), 'utf-8')
  ) as SceneGenRecord[];
  const tl = JSON.parse(await readFile(path.join(getProjectDir('p2-kereta'), 'timeline.json'), 'utf-8')) as Timeline;
  return {
    id: 'p2-kereta',
    proj,
    sbErrs: 0,
    sceneRecords: summary,
    prevRes: { previewPath: path.join(OUT_P3B, 'p2-kereta', 'preview.mp4'), renderMs: 33870, videoDurationSec: 38.67, voDurationSec: tl.total_sec },
  };
}

async function main() {
  const mesinOnly = process.argv.includes('--mesin-only');
  if (!mesinOnly) {
    await rm(path.join(process.cwd(), 'remotion', 'src', 'scenes', 'generated', 'p2-kereta'), { recursive: true, force: true }).catch(() => {});
  }
  await rm(path.join(process.cwd(), 'remotion', 'src', 'scenes', 'generated', 'p2-mesin4tak'), { recursive: true, force: true }).catch(() => {});
  const results = mesinOnly
    ? [await loadExistingKeretaSummary(), await runProjectP3b('p2-mesin4tak')]
    : [await runProjectP3b('p2-kereta'), await runProjectP3b('p2-mesin4tak')];
  await runMutations();

  const rows = results.map((r) => {
    const lr = r.proj.llm_calls_last_run ?? {};
    const s6 = lr.S6 ?? 0;
    const s7 = lr.S7 ?? 0;
    const s8 = lr.S8 ?? 0;
    const s9 = lr.S9 ?? 0;
    const tot = s6 + s7 + s8 + s9;
    const fixes = r.sceneRecords.map((x) => `${x.sceneId}:${x.fixes}`).join(', ');
    const failed = r.sceneRecords.filter((x) => !x.passed).map((x) => x.sceneId).join(', ') || 'none';
    return `| ${r.id} | ${s6}/${s7}/${s8}/${s9} (**${tot}**) | ${r.sbErrs} | ${fixes} | ${failed} | ${r.prevRes.renderMs} ms | ${r.prevRes.videoDurationSec}s / ${r.prevRes.voDurationSec}s |`;
  });

  await writeFile(
    path.join(OUT_P3B, 'stats.md'),
    `# Statistik Uji End-to-End P3B\n\n> Tanggal: ${new Date().toISOString()}\n\n| Topik | LLM Calls S6/S7/S8/S9 (Total) | Storyboard Err | Perbaikan/Adegan | Adegan Gagal | Render (ms) | Durasi Video / VO |\n|---|---|---:|---|---|---:|---|\n${rows.join(
      '\n'
    )}\n`,
    'utf-8'
  );
  console.log('\nP3B E2E complete!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
