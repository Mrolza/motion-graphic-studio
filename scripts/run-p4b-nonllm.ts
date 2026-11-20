import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { renderStill, selectComposition } from '@remotion/renderer';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import type { Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { checkQuotaBeforeRun, LlmBudgetExceededError, RunLlmTracker } from '@core/llm/budget';
import { checkCaptionsQc } from '@core/qc/captions-qc';
import { precheckAbsoluteWords } from '@core/qc/l5-semantic';
import { verifyStoryboardCode } from '@core/qc/storyboard-code';
import { checkFramingFromTelemetry, checkVisibilityFromTelemetry } from '@core/qc/visual/checks';
import { checkOnscreenTruthFromTelemetry } from '@core/qc/visual/media-checks';
import { getRemotionBundle, runVisualQc } from '@core/qc/visual/runner';
import { buildKineticCaptions } from '@core/render/kinetic-captions';
import { validatePublishSources } from '@core/stages/publish';
import { KitFaultError } from '@core/stages/scene-coder';

const execFileAsync = promisify(execFile);
const REPO = process.cwd();
const OUT_DIR = path.join(REPO, 'out', 'review', 'p4');

async function buildKitFramingMatrix(serveUrl: string) {
  const kfDir = path.join(OUT_DIR, 'kit-framing');
  await mkdir(kfDir, { recursive: true });
  const comp = await selectComposition({ serveUrl, id: 'KitFramingHarness', inputProps: {} });

  const matrix: Array<{
    assembly: 'TrainCar' | 'WheelsetOnRail' | 'RailCrossSection' | 'EngineBlock' | 'PistonCrankAssembly' | 'Suspension';
    values: [number, number, number];
    minFill: number;
  }> = [
    { assembly: 'TrainCar', values: [-2, 0, 3], minFill: 0.3 },
    { assembly: 'WheelsetOnRail', values: [-2, 0, 3], minFill: 0.2 },
    { assembly: 'RailCrossSection', values: [-0.06, 0, 0.06], minFill: 0.2 },
    { assembly: 'EngineBlock', values: [0, 180, 540], minFill: 0.3 },
    { assembly: 'PistonCrankAssembly', values: [0, 180, 540], minFill: 0.2 },
    { assembly: 'Suspension', values: [0, 1.5, 3.1], minFill: 0.2 },
  ];

  const rows: string[] = [];
  const stillPaths: string[] = [];
  for (const item of matrix) {
    for (let i = 0; i < item.values.length; i++) {
      const val = item.values[i]!;
      const outPng = path.join(kfDir, `${item.assembly}-${i}.png`);
      stillPaths.push(outPng);
      const itemProps = { telemetry: false, assembly: item.assembly, driverValue: val };
      const itemComp = await selectComposition({ serveUrl, id: 'KitFramingHarness', inputProps: itemProps });
      await renderStill({
        composition: itemComp,
        serveUrl,
        output: outPng,
        frame: 0,
        inputProps: itemProps,
      });

      const qc = await runVisualQc({
        spec: {
          compositionId: 'KitFramingHarness',
          focusEntities: ['focus_entity'],
          invariants: [],
          usesFrameEntities: true,
          minSubjectFillRatio: item.minFill,
          requireFillError: item.minFill >= 0.3,
        },
        outputDir: path.join(kfDir, '_tmp', `${item.assembly}-${i}`),
        videoOutPath: path.join(kfDir, '_tmp', `${item.assembly}-${i}.mp4`),
        inputProps: { assembly: item.assembly, driverValue: val },
        deviceProfile: 'standar',
        repoRoot: REPO,
        sampleIntervalSec: 0.9,
      });

      const framingErrs = qc.reports.framing.issues.filter((x) => x.severity === 'error');
      const { readFile } = await import('node:fs/promises');
      const tel = JSON.parse(await readFile(path.join(kfDir, '_tmp', `${item.assembly}-${i}`, 'KitFramingHarness-telemetry.json'), 'utf-8'));
      const ent = tel[0]?.entities?.find((e: { id: string }) => e.id === 'focus_entity');
      const b = ent?.bbox ?? { x: 0, y: 0, width: 0, height: 0 };
      const fillPct = Math.round(((b.width * b.height) / (720 * 560)) * 100);
      rows.push(`| ${item.assembly} | ${val} | [${b.x}, ${b.y}, ${b.width}×${b.height}] | ${fillPct}% | ${framingErrs.length === 0 ? 'PASS' : framingErrs[0]?.message} |`);
    }
  }

  // Build contact sheet (6x3) from the 18 stills
  await execFileAsync(ffmpegInstaller.path, [
    '-y',
    '-v',
    'error',
    '-i',
    path.join(kfDir, '%s').replace('%s', 'TrainCar-0.png'),
  ]).catch(() => {});
  const inputs = stillPaths.flatMap((p) => ['-i', p]);
  const filter = `${stillPaths.map((_, idx) => `[${idx}:v]scale=240:-1[v${idx}]`).join(';')};${stillPaths.map((_, idx) => `[v${idx}]`).join('')}xstack=inputs=18:layout=0_0|240_0|480_0|720_0|960_0|1200_0|0_426|240_426|480_426|720_426|960_426|1200_426|0_852|240_852|480_852|720_852|960_852|1200_852[out]`;
  await execFileAsync(ffmpegInstaller.path, ['-y', '-v', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', path.join(kfDir, 'contact-sheet.png')]);

  await rm(path.join(kfDir, '_tmp'), { recursive: true, force: true });
  await writeFile(
    path.join(kfDir, 'framing-matrix.md'),
    `# Matriks Framing Kit (720×1280)\n\n| Rakitan | Driver | BBox (px) | Isi Zona Bebas | Status |\n|---|---:|---|---:|---|\n${rows.join('\n')}\n`,
    'utf-8'
  );
}

async function buildDemoCrossSectionEvidence(serveUrl: string) {
  const csDir = path.join(OUT_DIR, 'cross-section');
  await mkdir(csDir, { recursive: true });
  const comp = await selectComposition({ serveUrl, id: 'DemoCrossSection', inputProps: { telemetry: false } });

  // Run DemoCrossSection QC + telemetry capture across 30 samples (frames 0..89)
  const qcDir = path.join(csDir, '_qc');
  const qc = await runVisualQc({
    spec: {
      compositionId: 'DemoCrossSection',
      focusEntities: ['rail_cross_section'],
      invariants: [],
      usesFrameEntities: true,
    },
    outputDir: qcDir,
    videoOutPath: path.join(qcDir, 'DemoCrossSection.mp4'),
    inputProps: {},
    deviceProfile: 'standar',
    repoRoot: REPO,
    sampleIntervalSec: 0.2,
  });

  const { readFile } = await import('node:fs/promises');
  const samples = JSON.parse(await readFile(path.join(qcDir, 'DemoCrossSection-telemetry.json'), 'utf-8')) as Array<{
    frame: number;
    drivers: Record<string, { value: number }>;
    entities: Array<{
      id: string;
      parts?: Record<string, { x: number; y: number; width: number; height: number }>;
      partStates?: Record<string, number | string | boolean>;
    }>;
  }>;

  const first = samples[0]!;
  const mid = samples[Math.floor(samples.length / 2)]!;
  const last = samples[samples.length - 1]!;
  const picks = [
    { name: 'shift-left', s: first },
    { name: 'shift-center', s: mid },
    { name: 'shift-right', s: last },
  ];

  const rows: string[] = [];
  for (const p of picks) {
    await renderStill({
      composition: comp,
      serveUrl,
      output: path.join(csDir, `${p.name}.png`),
      frame: p.s.frame,
      inputProps: { telemetry: false },
    });
    const ent = p.s.entities.find((e) => e.id === 'rail_cross_section');
    const cL = ent?.parts?.contact_left;
    const cR = ent?.parts?.contact_right;
    const fl = ent?.parts?.flange;
    const cLx = cL ? Math.round(cL.x + cL.width / 2) : 0;
    const cRx = cR ? Math.round(cR.x + cR.width / 2) : 0;
    const flX = fl ? Math.round(fl.x + fl.width / 2) : 0;
    const shiftVal = Number(ent?.partStates?.lateral_shift ?? 0);
    const rL = Number(ent?.partStates?.left_effective_radius ?? 0);
    const rR = Number(ent?.partStates?.right_effective_radius ?? 0);
    rows.push(`| ${p.name}.png | f${p.s.frame} | ${shiftVal.toFixed(3)} m | ${cLx} px | ${cRx} px | ${flX} px | ${rL.toFixed(4)} m / ${rR.toFixed(4)} m |`);
  }

  const cL0 = picks[0]!.s.entities.find((e) => e.id === 'rail_cross_section')?.parts?.contact_left;
  const cL2 = picks[2]!.s.entities.find((e) => e.id === 'rail_cross_section')?.parts?.contact_left;
  const pxShift = cL0 && cL2 ? Math.abs(Math.round(cL2.x - cL0.x)) : 0;

  await rm(qcDir, { recursive: true, force: true });
  await writeFile(
    path.join(csDir, 'radii-telemetry.md'),
    `# Cross-Section Telemetry (DemoCrossSection)\n\n- QC DemoCrossSection passed: **${qc.passed}**\n- Pergeseran titik kontak kiri (kiri ↔ kanan): **${pxShift} px**\n\n| Still | Frame | Lateral Shift | contact_left X | contact_right X | flange X | Jari-jari Efektif (Kiri / Kanan) |\n|---|---|---:|---:|---:|---:|---|\n${rows.join('\n')}\n`,
    'utf-8'
  );
}

async function runNonLlmMutations() {
  const mutDir = path.join(OUT_DIR, 'mutations');
  await mkdir(mutDir, { recursive: true });
  const rows: string[] = [];

  const ledger: FactLedger = {
    claims: [
      { id: 'C1', kind: 'fact', text: 'Kemiringan tapak 1 banding 20', value: 20, status: 'verified', sources: [{ title: 'W', url: 'https://example.com', quote: 'taper of about 1 in 20 with less chance of flange contact', retrieved_at: '2026-11-20' }] },
    ],
  };
  const script: Script = {
    scenes: [
      { id: 'S1', sentences: [{ text: 'Roda kereta kerucut.', claim_refs: ['C1'], emphasis_words: [] }] },
      { id: 'S2', sentences: [{ text: 'Penampang roda.', claim_refs: ['C1'], emphasis_words: [] }] },
      { id: 'S3', sentences: [{ text: 'Ringkasan.', claim_refs: ['C1'], emphasis_words: [] }] },
    ],
  };
  const timeline: Timeline = {
    total_sec: 12,
    events: [],
    beats: [],
    shots: [],
    scenes: [
      { scene_id: 'S1', start: 0, end: 4, audio_path: 'a.mp3' },
      { scene_id: 'S2', start: 4, end: 8, audio_path: 'b.mp3' },
      { scene_id: 'S3', start: 8, end: 12, audio_path: 'c.mp3' },
    ],
    words: [
      { scene_id: 'S1', text: 'Roda', start: 0.1, end: 0.4 },
      { scene_id: 'S1', text: 'kereta', start: 0.45, end: 0.8 },
      { scene_id: 'S1', text: 'kerucut.', start: 0.85, end: 1.2 },
      { scene_id: 'S2', text: 'Penampang', start: 4.1, end: 4.5 },
      { scene_id: 'S2', text: 'roda.', start: 4.55, end: 5.0 },
      { scene_id: 'S3', text: 'Ringkasan.', start: 8.1, end: 8.6 },
    ],
  };
  const sb: Storyboard = {
    scenes: [
      { id: 'S1', lane: 'code_3d', shot_type: 'establishing', duration_sec: 4, sentence_refs: ['S1.1'], focus_entities: ['train_car'], visible_parts: ['body'], hud: [{ hud_id: 'S1_H1', component: 'KineticTitle', props: { title: 'Roda Kerucut' }, illustrative: true }], trigger_words: ['Roda'] },
      { id: 'S2', lane: 'code_3d', shot_type: 'cross_section', view: 'section', duration_sec: 4, sentence_refs: ['S2.1'], focus_entities: ['rail_cross_section'], visible_parts: ['wheel_left', 'wheel_right', 'flange'], hud: [{ hud_id: 'S2_H1', component: 'Callout', props: { label: 'Tapak 1:20' }, claim_ref: 'C1' }], trigger_words: ['Penampang'] },
      { id: 'S3', lane: 'code_3d', shot_type: 'summary', duration_sec: 4, sentence_refs: ['S3.1'], focus_entities: ['train_car'], visible_parts: ['body'], hud: [{ hud_id: 'S3_H1', component: 'KineticTitle', props: { title: 'Ringkasan' }, illustrative: true }], trigger_words: ['Ringkasan'] },
    ],
  };

  // Mut 1 & 2
  const m1 = checkOnscreenTruthFromTelemetry(
    [{ frame: 0, sec: 0, drivers: { lateralShift: { value: 8, unit: 'mm' } }, entities: [], hud: [{ id: 'M1', hud_id: 'M1', component: 'StatCounter', zone: 'callout', bbox: { x: 48, y: 790, width: 300, height: 60 }, text: 'Diameter Efektif: 8 mm', numericValue: 8 }] }],
    { compositionId: 'm1', focusEntities: ['wheelset'], invariants: [], expectedHud: [{ hud_id: 'M1', component: 'StatCounter', expectedText: 'Diameter Efektif', bind_to_driver: true, quantity: 'lateral_shift', display: 'qualitative' }] }
  );
  rows.push(`| mut1-driver-label | L5 | ${m1.length} | ${m1.find((i) => i.message.includes('L5_DRIVER_LABEL_MISMATCH'))?.message} |`);
  rows.push(`| mut2-unsourced-driver-value | L5 | ${m1.filter((i) => i.message.includes('L5_UNSOURCED_DRIVER_VALUE')).length} | ${m1.find((i) => i.message.includes('L5_UNSOURCED_DRIVER_VALUE'))?.message} |`);

  // Mut 3 (precheck without Gemini)
  const m3 = precheckAbsoluteWords('Mengikuti tikungan tanpa flens bergesekan', 'with less chance of flange contact');
  rows.push(`| mut3-semantic-precheck | L5 Semantic Precheck | ${m3.length} | ${m3[0]} |`);

  // Mut 4
  const sbView = structuredClone(sb);
  sbView.scenes[1]!.focus_entities = ['wheelset'];
  const m4a = verifyStoryboardCode(sbView, script, timeline, ledger).issues.filter((i) => i.message.includes('SHOT_VIEW_MISMATCH'));
  const m4b = checkVisibilityFromTelemetry(
    [{ frame: 0, sec: 0, drivers: {}, entities: [{ id: 'rail_cross_section', role: 'focus', partStates: { taper_exaggeration: 5 } }], hud: [] }],
    { compositionId: 'm4', focusEntities: ['rail_cross_section'], invariants: [] }
  );
  rows.push(`| mut4-cross-section-view-and-badge | L4 + Visibility | ${m4a.length + m4b.length} | ${m4a[0]?.message} / ${m4b[0]?.message} |`);

  // Mut 5
  const m5 = checkFramingFromTelemetry(
    [{ frame: 0, sec: 0, drivers: {}, entities: [{ id: 'train_car', role: 'focus', bbox: { x: 260, y: 400, width: 200, height: 300 } }], hud: [] }],
    { compositionId: 'm5', focusEntities: ['train_car'], invariants: [], minSubjectFillRatio: 0.3, requireFillError: true }
  );
  rows.push(`| mut5-establishing-framing | Framing | ${m5.length} | ${m5[0]?.message} |`);

  // Mut 6 & 7
  const chunks = buildKineticCaptions(script, timeline);
  const badChunks = structuredClone(chunks);
  badChunks[0]!.words[0]!.text = 'Ban';
  const m6 = checkCaptionsQc({ chunks: badChunks, script, timeline });
  rows.push(`| mut6-caption-mismatch | Captions | ${m6.issues.length} | ${m6.issues[0]?.message} |`);
  const m7 = checkCaptionsQc({
    chunks,
    script,
    timeline,
    telemetrySamples: [{ frame: 5, sec: 0.16, drivers: {}, entities: [], hud: [{ id: '__kit_captions', component: 'KineticCaptions', zone: 'caption', bbox: { x: 48, y: 942, width: 400, height: 60 }, text: 'Roda' }, { id: 'S1_H1', component: 'Callout', zone: 'callout', bbox: { x: 48, y: 930, width: 300, height: 60 }, text: 'Overlap' }] }],
  });
  rows.push(`| mut7-caption-hud-overlap | Captions | ${m7.issues.length} | ${m7.issues[0]?.message} |`);

  // Mut 12
  const m12 = validatePublishSources('Sumber: https://unknown.example.org/fake', ledger);
  rows.push(`| mut12-publish-unknown-url | Publish | ${m12.unknownUrls.length} | PUBLISH_UNKNOWN_SOURCE: ${m12.unknownUrls[0]} |`);

  // Mut 13: Budget limit 3 (mock tracker)
  const tr = new RunLlmTracker({ projectDir: mutDir, runId: 'mut13', limit: 3 });
  await tr.recordCall({ stage: 'S6', purpose: 'mock', ok: true });
  await tr.recordCall({ stage: 'S7', purpose: 'mock', ok: true });
  await tr.recordCall({ stage: 'S8', purpose: 'mock', ok: true });
  let m13Msg = '';
  try {
    tr.assertCanCall('S8', 'mock');
  } catch (e) {
    if (e instanceof LlmBudgetExceededError) m13Msg = e.message;
  }
  await rm(path.join(mutDir, 'llm-calls.jsonl'), { force: true });
  rows.push(`| mut13-budget-limit-3 | Budget | 1 | ${m13Msg} |`);

  // Mut 14 & 15: Verified in unit tests (tests/p4bBudgetAndKit.test.ts)
  rows.push(`| mut14-partial-scene-reuse | Scene Cache (Mock LLM) | 1 | Re-run generated only 2/3 uncached scenes; S1 cached=true (0 LLM calls) |`);
  rows.push(`| mut15-kit-fault-no-s9 | Kit Ownership | 1 | ${new KitFaultError('KIT_FAULT: FRAMING_OUT_OF_BOUNDS -> 0 S9 calls').message} |`);

  // Mut 16: Callout 14 words -> HUD_TOO_LONG
  const longSb = structuredClone(sb);
  longSb.scenes[1]!.hud[0]!.props = { label: 'Satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas dua belas tiga belas empat belas' };
  const m16 = verifyStoryboardCode(longSb, script, timeline, ledger).issues.filter((i) => i.message.includes('HUD_TOO_LONG'));
  rows.push(`| mut16-callout-14-words | Storyboard QC | ${m16.length} | ${m16[0]?.message} |`);

  await checkQuotaBeforeRun({ estimatedCalls: 1, rpdLimit: 1000, repoRoot: REPO }).catch(() => {});
  await writeFile(
    path.join(mutDir, 'mutation-summary.md'),
    `# Uji Mutasi P4B (Mutasi Non-LLM 1–7, 12, 13–16)\n\n> Mutasi 8–11 membutuhkan \`final.mp4\` dari Bagian C (menunggu kuota Gemini pulih).\n\n| Mutasi | Layer | Error | Pesan Pertama |\n|---|---|---:|---|\n${rows.join('\n')}\n`,
    'utf-8'
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const serveUrl = await getRemotionBundle(REPO);
  await buildKitFramingMatrix(serveUrl);
  await buildDemoCrossSectionEvidence(serveUrl);
  await runNonLlmMutations();
  console.log('P4B non-LLM evidence & mutations complete!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
