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
import { runVisualQc } from '@core/qc/visual/runner';
import { DEMO_KERETA_SPEC, DEMO_MESIN_SPEC } from '@core/qc/visual/specs';
import { runPreviewRenderStage } from '@core/stages/preview';
import { runScenesStage, type SceneGenRecord } from '@core/stages/scene-coder';
import { runStoryboardStage } from '@core/stages/storyboard';

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

async function runProjectP3c(id: string) {
  console.log(`\n=== P3C E2E (S6->Preview, reusing S5 voice) for ${id} ===`);
  await resetProjectLastRunCalls(id);
  const projDir = getProjectDir(id);
  const timeline = JSON.parse(await readFile(path.join(projDir, 'timeline.json'), 'utf-8')) as Timeline;

  const sb = await runStoryboardStage(id);
  const sbQc = await runStoryboardQcStage(id);
  const sbErrs = sbQc.report.issues.filter((i) => i.severity === 'error');
  console.log(
    `  S6-S7 Storyboard done: scenes=${sb.scenes.length}, rewritten=${sbQc.rewritten}, errors=${sbErrs.length}`
  );
  if (sbErrs.length > 0) {
    throw new Error(`Storyboard QC blocked ${id}: ${sbErrs.map((e) => e.message).join('; ')}`);
  }

  const sceneRecords: SceneGenRecord[] = await runScenesStage(id);
  for (const r of sceneRecords) {
    console.log(`  S8-S9 ${r.sceneId}: passed=${r.passed}, fixes=${r.fixes}, lines=${r.lineCount}`);
  }

  const prevRes = await runPreviewRenderStage(id);
  console.log(
    `  Preview done: video=${prevRes.videoDurationSec}s, vo=${prevRes.voDurationSec}s, render=${prevRes.renderMs}ms`
  );

  const topicOut = path.join(OUT_P3B, id);
  await rm(topicOut, { recursive: true, force: true }).catch(() => {});
  await mkdir(topicOut, { recursive: true });

  await copyFile(path.join(projDir, 'timeline.json'), path.join(topicOut, 'timeline.json'));
  await copyFile(path.join(projDir, 'storyboard.json'), path.join(topicOut, 'storyboard.json'));
  await copyFile(path.join(projDir, 'onscreen-text.md'), path.join(topicOut, 'onscreen-text.md'));
  await copyFile(prevRes.previewPath, path.join(topicOut, 'preview.mp4'));
  await cp(path.join(projDir, 'qc'), path.join(topicOut, 'qc'), { recursive: true });
  await cp(path.join(projDir, 'scenes'), path.join(topicOut, 'scenes'), { recursive: true });
  await extractContactSheetAndStills(prevRes.previewPath, timeline, topicOut);

  const proj = await loadProject(id);
  return { id, proj, sbErrs: sbErrs.length, sceneRecords, prevRes };
}

async function runP3cMutations() {
  const mutDir = path.join(OUT_P3B, 'mutations');
  await rm(mutDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(mutDir, { recursive: true });

  const rows: string[] = [];

  // Mut 1: L5_UNSANCTIONED_HUD (real render telemetry on DemoKereta where expectedHud omits callout_flange)
  const mut1Dir = path.join(mutDir, 'mut1-unsanctioned-hud');
  const mut1Res = await runVisualQc({
    spec: {
      ...DEMO_KERETA_SPEC,
      expectedHud: [{ hud_id: 'title_kereta', component: 'KineticTitle', expectedText: 'Mengapa Kereta Bisa Berbelok?' }],
    },
    outputDir: mut1Dir,
    videoOutPath: path.join(mut1Dir, '_tmp.mp4'),
    deviceProfile: 'standar',
  });
  await rm(path.join(mut1Dir, '_tmp.mp4'), { force: true }).catch(() => {});
  rows.push(`| mut1-unsanctioned-hud | onscreenTruth (L5) | ${mut1Res.reports.onscreenTruth.issues.length} | ${mut1Res.reports.onscreenTruth.issues[0]?.message ?? 'MISS'} |`);

  // Mut 2: L5_FACT_MISMATCH (real render telemetry on DemoKereta with 1.435 m vs claim unit mm)
  const mut2Dir = path.join(mutDir, 'mut2-fact-mismatch');
  const mut2Res = await runVisualQc({
    spec: {
      ...DEMO_KERETA_SPEC,
      expectedHud: [
        { hud_id: 'title_kereta', component: 'KineticTitle', expectedText: 'Mengapa Kereta Bisa Berbelok?' },
        { hud_id: 'measure_taper', component: 'MeasureReveal', expectedText: 'Lebar rel: 1.435 mm', claim_ref: 'C1', claimUnit: 'mm', claimAllowedNumbers: [1435] },
        { hud_id: 'callout_flange', component: 'Callout', expectedText: 'Flens di Sisi Dalam' },
        { hud_id: 'callout_inertia', component: 'Callout', expectedText: 'Inersia' },
        { hud_id: 'compare_diameter', component: 'CompareCard', expectedText: 'Roda Dalam' },
        { hud_id: 'callout_effective', component: 'Callout', expectedText: 'Gandar Kaku' },
      ],
    },
    outputDir: mut2Dir,
    videoOutPath: path.join(mut2Dir, '_tmp.mp4'),
    inputProps: { mutation: 'hud-format' },
    deviceProfile: 'standar',
  });
  await rm(path.join(mut2Dir, '_tmp.mp4'), { force: true }).catch(() => {});
  const m2Issue = mut2Res.reports.onscreenTruth.issues.find((i) => i.message.includes('L5_FACT_MISMATCH')) ?? mut2Res.reports.hudFormat.issues[0];
  rows.push(`| mut2-fact-mismatch | onscreenTruth (L5) | ${mut2Res.reports.onscreenTruth.issues.length} | ${m2Issue?.message ?? 'MISS'} |`);

  // Mut 3: MECHANICS_HUD_OUT_OF_PHASE (real render telemetry on DemoMesin)
  const mut3Dir = path.join(mutDir, 'mut3-phase-hud');
  const mut3Res = await runVisualQc({
    spec: {
      ...DEMO_MESIN_SPEC,
      expectedHud: [
        { hud_id: 'title_mesin', component: 'KineticTitle', expectedText: 'Siklus Mesin 4 Tak' },
        { hud_id: 'list_strokes', component: 'ListReveal', expectedText: 'Hisap' },
        { hud_id: 'stat_crank_angle', component: 'StatCounter', expectedText: 'Sudut Engkol', bind_to_driver: true, when: { driver_between: [360, 540] } },
      ],
    },
    outputDir: mut3Dir,
    videoOutPath: path.join(mut3Dir, '_tmp.mp4'),
    deviceProfile: 'standar',
  });
  await rm(path.join(mut3Dir, '_tmp.mp4'), { force: true }).catch(() => {});
  const m3Issue = mut3Res.reports.mechanics.issues.find((i) => i.message.includes('MECHANICS_HUD_OUT_OF_PHASE'));
  rows.push(`| mut3-phase-hud | mechanics | ${mut3Res.reports.mechanics.issues.length} | ${m3Issue?.message ?? 'MISS'} |`);

  // Mut 4: HUD_UNNORMALIZED_UNIT ("524 deg" via real render telemetry on DemoMesin)
  const mut4Dir = path.join(mutDir, 'mut4-deg-unit');
  const mut4Res = await runVisualQc({
    spec: DEMO_MESIN_SPEC,
    outputDir: mut4Dir,
    videoOutPath: path.join(mut4Dir, '_tmp.mp4'),
    inputProps: { mutation: 'deg-unit' },
    deviceProfile: 'standar',
  });
  await rm(path.join(mut4Dir, '_tmp.mp4'), { force: true }).catch(() => {});
  rows.push(`| mut4-deg-unit | hudFormat | ${mut4Res.reports.hudFormat.issues.length} | ${mut4Res.reports.hudFormat.issues[0]?.message ?? 'MISS'} |`);

  // Mut 5: Shot variety QC (3 consecutive scenes with identical shot_type and focus_entities)
  const projDir = getProjectDir('p2-kereta');
  const script = JSON.parse(await readFile(path.join(projDir, 'script.json'), 'utf-8')) as Script;
  const timeline = JSON.parse(await readFile(path.join(projDir, 'timeline.json'), 'utf-8')) as Timeline;
  const ledger = JSON.parse(await readFile(path.join(projDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const baseSb = JSON.parse(await readFile(path.join(projDir, 'storyboard.json'), 'utf-8')) as Storyboard;
  const mut5Sb: Storyboard = {
    scenes: baseSb.scenes.map((s) => ({ ...s, shot_type: 'closeup', focus_entities: ['wheelset'] })),
  };
  const mut5Rep = verifyStoryboardCode(mut5Sb, script, timeline, ledger);
  await writeFile(path.join(mutDir, 'mut5-shot-variety.json'), JSON.stringify(mut5Rep, null, 2), 'utf-8');
  const m5Issue = mut5Rep.issues.find((i) => i.message.includes('SB_CONSECUTIVE_DUPLICATE_SHOT') || i.message.includes('SB_LOW_SHOT_VARIETY'));
  rows.push(`| mut5-shot-variety | Storyboard QC | ${mut5Rep.issues.length} | ${m5Issue?.message ?? 'MISS'} |`);

  // Mut 6: Real render sync mutation (DemoMesin driver delayed by 1.5s, syncTargetSec=0)
  const mut6Dir = path.join(mutDir, 'mut6-sync-real-render');
  const mut6Res = await runVisualQc({
    spec: { ...DEMO_MESIN_SPEC, syncTargetSec: 0, syncToleranceSec: 0.35 },
    outputDir: mut6Dir,
    videoOutPath: path.join(mut6Dir, '_tmp.mp4'),
    inputProps: { mutation: 'delay-sync' },
    deviceProfile: 'standar',
  });
  await rm(path.join(mut6Dir, '_tmp.mp4'), { force: true }).catch(() => {});
  rows.push(`| mut6-sync-real-render | sync | ${mut6Res.reports.sync.issues.length} | ${mut6Res.reports.sync.issues[0]?.message ?? 'MISS'} |`);

  await writeFile(
    path.join(mutDir, 'mutation-summary.md'),
    `# Uji Mutasi P3C (6 Mutasi — Render & Telemetri Sungguhan)\n\n| Mutasi | Layer | Jumlah Error | Pesan Pertama |\n|---|---|---:|---|\n${rows.join('\n')}\n`,
    'utf-8'
  );
}

async function main() {
  await rm(path.join(process.cwd(), 'remotion', 'src', 'scenes', 'generated', 'p2-kereta'), { recursive: true, force: true }).catch(() => {});
  await rm(path.join(process.cwd(), 'remotion', 'src', 'scenes', 'generated', 'p2-mesin4tak'), { recursive: true, force: true }).catch(() => {});
  const results = [await runProjectP3c('p2-kereta'), await runProjectP3c('p2-mesin4tak')];
  await runP3cMutations();

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
    `# Statistik Uji End-to-End P3C\n\n> Tanggal: ${new Date().toISOString()}\n\n| Topik | LLM Calls S6/S7/S8/S9 (Total) | Storyboard Err | Perbaikan/Adegan | Adegan Gagal | Render (ms) | Durasi Video / VO |\n|---|---|---:|---|---|---:|---|\n${rows.join(
      '\n'
    )}\n`,
    'utf-8'
  );
  console.log('\nP3C E2E & Mutations complete!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
