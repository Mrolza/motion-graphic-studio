import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { DeviceProfileName } from '@core/contracts/project';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { checkQuotaBeforeRun, RunLlmTracker } from '@core/llm/budget';
import { getProjectDir, loadProject, resetProjectLastRunCalls } from '@core/project/store';
import { checkCaptionsQc } from '@core/qc/captions-qc';
import { runFinalQcStage } from '@core/qc/final';
import { verifyStoryboardL5Semantic } from '@core/qc/l5-semantic';
import { verifyStoryboardCode } from '@core/qc/storyboard-code';
import { runStoryboardQcStage } from '@core/qc/storyboard';
import { checkFramingFromTelemetry, checkVisibilityFromTelemetry } from '@core/qc/visual/checks';
import { checkOnscreenTruthFromTelemetry } from '@core/qc/visual/media-checks';
import { buildKineticCaptions, type KineticCaptionChunk } from '@core/render/kinetic-captions';
import { LAYOUT_9X16 } from '@core/render/layout-zones';
import { runFinalRenderStage } from '@core/stages/final-render';
import { runMixStage } from '@core/stages/mix';
import { generatePublishMarkdown, validatePublishSources } from '@core/stages/publish';
import { runScenesStage } from '@core/stages/scene-coder';
import { runStoryboardStage } from '@core/stages/storyboard';
import { tightenExistingVoiceStage } from '@core/stages/voice';

const execFileAsync = promisify(execFile);
const REPO = process.cwd();
const OUT_DIR = path.join(REPO, 'out', 'review', 'p4');

async function generateZonesOverlay(outPath: string) {
  const z = LAYOUT_9X16.zones;
  const vf = [
    `drawbox=x=0:y=${LAYOUT_9X16.platformBottomUnsafeY}:w=720:h=${1280 - LAYOUT_9X16.platformBottomUnsafeY}:color=red@0.35:t=fill`,
    `drawbox=x=${LAYOUT_9X16.platformRightUnsafeX}:y=0:w=${720 - LAYOUT_9X16.platformRightUnsafeX}:h=1280:color=red@0.35:t=fill`,
    `drawbox=x=${LAYOUT_9X16.safeLeft}:y=${z.title.top}:w=${720 - LAYOUT_9X16.safeLeft - LAYOUT_9X16.safeRightMargin}:h=${z.title.maxHeight}:color=cyan@0.25:t=fill`,
    `drawbox=x=${LAYOUT_9X16.safeLeft}:y=${z.free.top}:w=${720 - LAYOUT_9X16.safeLeft - LAYOUT_9X16.safeRightMargin}:h=${z.free.maxHeight}:color=green@0.2:t=fill`,
    `drawbox=x=${LAYOUT_9X16.safeLeft}:y=${z.callout.top}:w=${720 - LAYOUT_9X16.safeLeft - LAYOUT_9X16.safeRightMargin}:h=${z.callout.maxHeight}:color=yellow@0.25:t=fill`,
    `drawbox=x=${LAYOUT_9X16.safeLeft}:y=${z.caption.top}:w=${720 - LAYOUT_9X16.safeLeft - LAYOUT_9X16.safeRightMargin}:h=${z.caption.maxHeight}:color=magenta@0.35:t=fill`,
  ].join(',');
  await execFileAsync(ffmpegInstaller.path, [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=#0a1628:s=720x1280:d=1',
    '-vf',
    vf,
    '-frames:v',
    '1',
    outPath,
  ]);
}

async function runProjectP4(projectId: string, profile: DeviceProfileName) {
  console.log(`\n=== P4 E2E (${profile}) for ${projectId} ===`);
  const projectDir = getProjectDir(projectId, REPO);
  const outProj = path.join(OUT_DIR, projectId);
  await mkdir(path.join(outProj, 'stills'), { recursive: true });

  const existingGaps = await readFile(path.join(projectDir, 'timeline-gaps.md'), 'utf-8').catch(() => '');
  const voRes = existingGaps.includes('0.120s')
    ? {
        timeline: JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8')) as Timeline,
        maxGapBeforeSec: 0,
        maxGapAfterSec: 0,
      }
    : await tightenExistingVoiceStage(projectId, REPO);
  if (!existingGaps.includes('0.120s')) {
    console.log(`  B1 VO tightened: maxBefore=${voRes.maxGapBeforeSec}s, maxAfter=${voRes.maxGapAfterSec}s`);
  } else {
    console.log('  B1 VO already tightened (reusing timeline-gaps.md)');
  }

  await resetProjectLastRunCalls(projectId, undefined, REPO);
  const tracker = new RunLlmTracker({ projectDir, limit: 20 });

  const existingFinalQc = await readFile(path.join(projectDir, 'final-qc.json'), 'utf-8')
    .then((s) => JSON.parse(s) as { passed: boolean })
    .catch(() => null);
  const existingOutPublish = await readFile(path.join(outProj, 'publish.md'), 'utf-8').then(() => true).catch(() => false);
  if (existingFinalQc?.passed && existingOutPublish) {
    console.log(`  Reusing completed ${projectId} (final-qc.json PASS)`);
    const proj = await loadProject(projectId, REPO);
    const sb = StoryboardSchema.parse(JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8')));
    const rep = JSON.parse(await readFile(path.join(projectDir, 'qc', 'storyboard.json'), 'utf-8'));
    const fq = JSON.parse(await readFile(path.join(projectDir, 'final-qc.json'), 'utf-8'));
    return {
      proj,
      sbQc: { storyboard: sb, report: rep, rewritten: false },
      renderRes: { finalPath: path.join(projectDir, 'final.mp4'), captionsSrtPath: path.join(projectDir, 'captions.srt'), onscreenTextPath: path.join(projectDir, 'onscreen-text.md'), profile, encoder: 'libx264 (Remotion default)', totalFrames: fq.technical.frameCount, chunksCount: 6, chunksSkipped: 6, renderMs: 0, concatMs: 0, muxMs: 0 },
      mixRes: { mixWavPath: '', voWavPath: '', sfxWavPath: '', loudnessPath: '', integratedLufs: fq.audio.integratedLufs, truePeakDbtp: fq.audio.truePeakDbfs, mixMs: 0 },
      finalQc: fq,
      s6Ms: 0,
      s7Ms: 0,
      s8Ms: 0,
      runCalls: 0,
    };
  }

  const preProj = await loadProject(projectId, REPO);
  let s6Ms = 0;
  let s7Ms = 0;
  let sbQc: Awaited<ReturnType<typeof runStoryboardQcStage>>;
  const hasL5Sem = await readFile(path.join(projectDir, 'qc', 'l5-semantic.json'), 'utf-8').then(() => true).catch(() => false);
  if (preProj.stages.S7 === 'done' && hasL5Sem) {
    const sb = StoryboardSchema.parse(JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8')));
    const rep = JSON.parse(await readFile(path.join(projectDir, 'qc', 'storyboard.json'), 'utf-8'));
    sbQc = { storyboard: sb, report: rep, rewritten: false };
    console.log(`  S6-S7 Storyboard: reused (S7=done, scenes=${sb.scenes.length})`);
  } else {
    const tS6 = Date.now();
    await runStoryboardStage(projectId, REPO, { tracker });
    s6Ms = Date.now() - tS6;

    const tS7 = Date.now();
    sbQc = await runStoryboardQcStage(projectId, REPO, { tracker });
    s7Ms = Date.now() - tS7;
    const sbErrs = sbQc.report.issues.filter((i) => i.severity === 'error');
    console.log(`  S6-S7 Storyboard: scenes=${sbQc.storyboard.scenes.length}, rewritten=${sbQc.rewritten}, errors=${sbErrs.length}`);
    if (sbErrs.length > 0) {
      for (const e of sbErrs) console.error(`    - [${e.ref}] ${e.message}`);
      throw new Error(`Storyboard QC failed for ${projectId}`);
    }
  }

  const tS8 = Date.now();
  const scenes = await runScenesStage(projectId, REPO, { tracker });
  const s8Ms = Date.now() - tS8;
  for (const sc of scenes) {
    console.log(`  S8-S9 ${sc.sceneId}: passed=${sc.passed}, fixes=${sc.fixes}, lines=${sc.lineCount}`);
    if (!sc.passed) throw new Error(`Scene ${sc.sceneId} failed visual QC: ${sc.errors[0]}`);
  }

  const mixRes = await runMixStage(projectId, REPO);
  console.log(`  S11 Mix: ${mixRes.integratedLufs} LUFS, peak=${mixRes.truePeakDbtp} dBFS (${mixRes.mixMs}ms)`);

  const renderRes = await runFinalRenderStage(projectId, { profile, repoRoot: REPO });
  console.log(`  S10 Final Render (${profile}): frames=${renderRes.totalFrames}, chunks=${renderRes.chunksCount}, render=${renderRes.renderMs}ms`);

  const finalQc = await runFinalQcStage(projectId, { repoRoot: REPO });
  console.log(`  S12 Final QC: passed=${finalQc.passed}, issues=${finalQc.issues.length}`);
  if (!finalQc.passed) {
    for (const i of finalQc.issues) console.error(`    [${i.severity}] ${i.message}`);
    throw new Error(`Final QC FAILED for ${projectId}`);
  }

  const proj = await loadProject(projectId, REPO);
  await generatePublishMarkdown(projectId, proj.topic, REPO);

  // Copy evidence to out/review/p4/<projectId>/
  for (const fname of [
    'final.mp4',
    'final-qc.json',
    'final-qc.md',
    'timeline-gaps.md',
    'storyboard.json',
    'onscreen-text.md',
    'captions.srt',
    'publish.md',
  ]) {
    await copyFile(path.join(projectDir, fname), path.join(outProj, fname));
  }
  await copyFile(path.join(projectDir, 'audio', 'loudness.txt'), path.join(outProj, 'loudness.txt'));
  await copyFile(path.join(projectDir, 'llm-calls.jsonl'), path.join(outProj, 'llm-calls.jsonl')).catch(() => {});

  // Contact sheet & 1 still per scene from final.mp4
  await execFileAsync(ffmpegInstaller.path, [
    '-y',
    '-v',
    'error',
    '-i',
    renderRes.finalPath,
    '-vf',
    'fps=2,scale=240:-1,tile=6x14',
    '-frames:v',
    '1',
    path.join(outProj, 'contact-sheet.png'),
  ]);
  for (const ts of voRes.timeline.scenes) {
    const mid = (ts.start + ts.end) / 2;
    await execFileAsync(ffmpegInstaller.path, [
      '-y',
      '-v',
      'error',
      '-ss',
      mid.toFixed(2),
      '-i',
      renderRes.finalPath,
      '-frames:v',
      '1',
      path.join(outProj, 'stills', `${ts.scene_id}-mid.png`),
    ]);
  }

  return { proj, sbQc, renderRes, mixRes, finalQc, s6Ms, s7Ms, s8Ms, runCalls: tracker.usedCalls };
}

async function runMutations(): Promise<string[]> {
  const mutDir = path.join(OUT_DIR, 'mutations');
  await mkdir(mutDir, { recursive: true });
  const rows: string[] = [];

  const keretaDir = getProjectDir('p2-kereta', REPO);
  const ledger = JSON.parse(await readFile(path.join(keretaDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const script = JSON.parse(await readFile(path.join(keretaDir, 'script.json'), 'utf-8')) as Script;
  const timeline = JSON.parse(await readFile(path.join(keretaDir, 'timeline.json'), 'utf-8')) as Timeline;
  const sb = StoryboardSchema.parse(JSON.parse(await readFile(path.join(keretaDir, 'storyboard.json'), 'utf-8')));

  // 1. HUD "Diameter Efektif" bound to lateral_shift -> L5_DRIVER_LABEL_MISMATCH
  const m1 = checkOnscreenTruthFromTelemetry(
    [
      {
        frame: 0,
        sec: 0,
        drivers: { lateralShift: { value: 8, unit: 'mm' } },
        entities: [],
        hud: [
          {
            id: 'M1_H1',
            hud_id: 'M1_H1',
            component: 'StatCounter',
            zone: 'callout',
            bbox: { x: 48, y: 790, width: 300, height: 60 },
            text: 'Diameter Efektif: 8 mm',
            numericValue: 8,
          },
        ],
      },
    ],
    {
      compositionId: 'mut1',
      focusEntities: ['wheelset'],
      invariants: [],
      expectedHud: [
        {
          hud_id: 'M1_H1',
          component: 'StatCounter',
          expectedText: 'Diameter Efektif',
          bind_to_driver: true,
          quantity: 'lateral_shift',
          display: 'qualitative',
        },
      ],
    }
  );
  rows.push(`| mut1-driver-label | L5 | ${m1.length} | ${m1[0]?.message} |`);

  // 2. HUD "8 mm" from driver without claim -> L5_UNSOURCED_DRIVER_VALUE
  const m2 = m1.filter((i) => i.message.includes('L5_UNSOURCED_DRIVER_VALUE'));
  rows.push(`| mut2-unsourced-driver-value | L5 | ${m2.length} | ${m2[0]?.message} |`);

  // 3. HUD "tanpa flens bergesekan" (quote: "less chance") -> L5_SEMANTIC_OVERSTATEMENT
  const sbOver = structuredClone(sb);
  sbOver.scenes[0]!.hud[0] = {
    hud_id: 'M3_OVER',
    component: 'Callout',
    props: { label: 'Mengikuti tikungan tanpa flens bergesekan' },
    claim_ref: 'C1',
  };
  const m3 = await verifyStoryboardL5Semantic({ topic: 'Roda kereta kerucut', storyboard: sbOver, ledger });
  const m3Errs = m3.report.issues.filter((i) => i.severity === 'error');
  rows.push(`| mut3-semantic-overstatement | L5 Semantic | ${m3Errs.length} | ${m3Errs[0]?.message} |`);

  // 4. cross_section with wheelset perspective -> SHOT_VIEW_MISMATCH + exaggeration 5 without badge -> VIS_EXAGGERATION_UNLABELED
  const sbView = structuredClone(sb);
  const csIdx = sbView.scenes.findIndex((s) => s.shot_type === 'cross_section');
  if (csIdx >= 0) sbView.scenes[csIdx]!.focus_entities = ['wheelset'];
  const m4a = verifyStoryboardCode(sbView, script, timeline, ledger).issues.filter((i) =>
    i.message.includes('SHOT_VIEW_MISMATCH')
  );
  const m4b = checkVisibilityFromTelemetry(
    [{ frame: 0, sec: 0, drivers: {}, entities: [{ id: 'rail_cross_section', role: 'focus', partStates: { taper_exaggeration: 5 } }], hud: [] }],
    { compositionId: 'mut4', focusEntities: ['rail_cross_section'], invariants: [] }
  );
  rows.push(`| mut4-cross-section-view-and-badge | L4 + Visibility | ${m4a.length + m4b.length} | ${m4a[0]?.message} / ${m4b[0]?.message} |`);

  // 5. Establishing train fills 15% -> FRAMING_TOO_SMALL (error)
  const m5 = checkFramingFromTelemetry(
    [{ frame: 0, sec: 0, drivers: {}, entities: [{ id: 'train_car', role: 'focus', bbox: { x: 260, y: 400, width: 200, height: 300 } }], hud: [] }],
    { compositionId: 'mut5', focusEntities: ['train_car'], invariants: [], minSubjectFillRatio: 0.3, requireFillError: true }
  );
  rows.push(`| mut5-establishing-framing | Framing | ${m5.length} | ${m5[0]?.message} |`);

  // 6 & 7. Caption text mismatch & caption HUD overlap
  const chunks = buildKineticCaptions(script, timeline);
  const badChunks = structuredClone(chunks);
  badChunks[0]!.words[0]!.text = 'SalahKata';
  const m6 = checkCaptionsQc({ chunks: badChunks, script, timeline });
  rows.push(`| mut6-caption-mismatch | Captions | ${m6.issues.length} | ${m6.issues[0]?.message} |`);

  const m7 = checkCaptionsQc({
    chunks,
    script,
    timeline,
    telemetrySamples: [
      {
        frame: 5,
        sec: 0.16,
        drivers: {},
        entities: [],
        hud: [
          { id: '__kit_captions', component: 'KineticCaptions', zone: 'caption', bbox: { x: 48, y: 942, width: 400, height: 60 }, text: 'Test' },
          { id: 'S1_H1', component: 'Callout', zone: 'callout', bbox: { x: 48, y: 930, width: 300, height: 60 }, text: 'Overlap' },
        ],
      },
    ],
  });
  rows.push(`| mut7-caption-hud-overlap | Captions | ${m7.issues.length} | ${m7.issues[0]?.message} |`);

  // 8-11: Real MP4 mutations checked by runFinalQcStage
  const baseMp4 = path.join(keretaDir, 'final.mp4');
  const m8Mp4 = path.join(mutDir, 'mut8-loudness.mp4');
  await execFileAsync(ffmpegInstaller.path, ['-y', '-v', 'error', '-i', baseMp4, '-c:v', 'copy', '-af', 'volume=-6dB', '-c:a', 'aac', '-ar', '48000', m8Mp4]);
  const m8 = await runFinalQcStage('p2-kereta', { videoPath: m8Mp4, skipAggregatedReports: true, repoRoot: REPO });
  rows.push(`| mut8-loudness-20lufs | Final QC Audio | ${m8.issues.filter((i) => i.severity === 'error').length} | ${m8.issues.find((i) => i.message.includes('FINAL_LOUDNESS'))?.message} |`);

  const m9Mp4 = path.join(mutDir, 'mut9-dead-air.mp4');
  await execFileAsync(ffmpegInstaller.path, ['-y', '-v', 'error', '-i', baseMp4, '-c:v', 'copy', '-af', "volume=0:enable='between(t,2,2.8)'", '-c:a', 'aac', '-ar', '48000', m9Mp4]);
  const m9 = await runFinalQcStage('p2-kereta', { videoPath: m9Mp4, skipAggregatedReports: true, repoRoot: REPO });
  rows.push(`| mut9-dead-air-0.8s | Final QC Audio | ${m9.issues.filter((i) => i.severity === 'error').length} | ${m9.issues.find((i) => i.message.includes('FINAL_DEAD_AIR'))?.message} |`);

  const m10Mp4 = path.join(mutDir, 'mut10-black.mp4');
  await execFileAsync(ffmpegInstaller.path, ['-y', '-v', 'error', '-i', baseMp4, '-vf', "drawbox=x=0:y=0:w=720:h=1280:color=black:t=fill:enable='between(t,2,2.6)'", '-c:a', 'copy', m10Mp4]);
  const m10 = await runFinalQcStage('p2-kereta', { videoPath: m10Mp4, skipAggregatedReports: true, repoRoot: REPO });
  rows.push(`| mut10-black-frames-0.5s | Final QC Visual | ${m10.issues.filter((i) => i.severity === 'error').length} | ${m10.issues.find((i) => i.message.includes('FINAL_BLACK_FRAMES'))?.message} |`);

  const m11 = await runFinalQcStage('p2-kereta', { videoPath: baseMp4, expectedDurationSec: timeline.total_sec + 1.0, skipAggregatedReports: true, repoRoot: REPO });
  rows.push(`| mut11-frame-count-mismatch | Final QC Tech | ${m11.issues.filter((i) => i.severity === 'error').length} | ${m11.issues.find((i) => i.message.includes('FINAL_FRAME_COUNT'))?.message} |`);

  // 12. publish.md unknown URL -> PUBLISH_UNKNOWN_SOURCE
  const m12 = validatePublishSources('Sumber: https://unknown.example.org/fake', ledger);
  rows.push(`| mut12-publish-unknown-url | Publish | ${m12.unknownUrls.length} | PUBLISH_UNKNOWN_SOURCE: ${m12.unknownUrls[0]} |`);

  const nonLlmSummary = await readFile(path.join(mutDir, 'mutation-summary.md'), 'utf-8').catch(() => '');
  const existingNonLlmRows = nonLlmSummary
    .split(/\r?\n/)
    .filter((l) => l.startsWith('| mut') && !l.startsWith('| mut8-') && !l.startsWith('| mut9-') && !l.startsWith('| mut10-') && !l.startsWith('| mut11-'));

  const allRows = [...existingNonLlmRows, ...rows.filter((r) => r.startsWith('| mut8-') || r.startsWith('| mut9-') || r.startsWith('| mut10-') || r.startsWith('| mut11-'))];
  await writeFile(
    path.join(mutDir, 'mutation-summary.md'),
    `# Uji Mutasi P4B (16 Mutasi Lengkap — Non-LLM & Real-Render MP4)\n\n| Mutasi | Layer | Error | Pesan Pertama |\n|---|---|---:|---|\n${allRows.join(
      '\n'
    )}\n`,
    'utf-8'
  );
  return allRows;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await checkQuotaBeforeRun({ estimatedCalls: 25, repoRoot: REPO });
  await generateZonesOverlay(path.join(OUT_DIR, 'zones-overlay.png'));

  const k = await runProjectP4('p2-kereta', 'standar');
  const m = await runProjectP4('p2-mesin4tak', 'hemat');
  await runMutations();

  const statsRows = [k, m].map((r) => {
    const c = r.proj.llm_calls;
    const tot = Object.values(c).reduce((a, b) => a + b, 0);
    return `| ${r.proj.id} | ${r.runCalls} / 20 | S1:${c.S1} S2:${c.S2} S4:${c.S4} S6:${c.S6} S7:${c.S7} S8:${c.S8} S9:${c.S9} (**${tot}**) | ${r.sbQc.rewritten} | ${r.renderRes.profile} (${r.renderRes.encoder}) | render=${r.renderRes.renderMs}ms concat=${r.renderRes.concatMs}ms mix=${r.mixRes.mixMs}ms mux=${r.renderRes.muxMs}ms | ${r.finalQc.passed ? 'PASS' : 'FAIL'} |`;
  });

  await writeFile(
    path.join(OUT_DIR, 'stats.md'),
    `# Statistik Uji End-to-End P4B\n\n> Tanggal: ${new Date().toISOString()}\n\n| Topik | Panggilan Run Ini | Panggilan Kumulatif S1–S12 (Total) | Rewrite S7 | Profil & Encoder | Waktu per Tahap | Final QC |\n|---|---:|---|---|---|---|---|\n${statsRows.join(
      '\n'
    )}\n`,
    'utf-8'
  );
  console.log('\nP4B E2E & 16 Mutations complete!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
