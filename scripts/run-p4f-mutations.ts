import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import type { Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { checkTtsVoiceConsistency } from '@core/qc/final-checks';
import { checkKeyStepsCoverage } from '@core/qc/l0b-quality';
import { verifyStoryboardCode } from '@core/qc/storyboard-code';
import { analyzeArrowDirectionFromTelemetry } from '@core/qc/visual/arrow-check';
import { checkMechanicsFromTelemetry } from '@core/qc/visual/checks';
import { checkOnscreenTruthFromTelemetry } from '@core/qc/visual/media-checks';
import type { TelemetrySample } from '@core/qc/visual/types';
import { buildVisualSpecForScene, validateSceneCodeSafety } from '@core/stages/scene-safety';
import { runP4EMutations } from './run-p4e-mutations';

export async function runP4FMutations(repoRoot: string, outDir: string): Promise<void> {
  await mkdir(path.join(outDir, 'mutations'), { recursive: true });
  await runP4EMutations(repoRoot, outDir);
  const summaryPath = path.join(outDir, 'mutations', 'mutation-summary.md');
  const existing = await readFile(summaryPath, 'utf-8');
  const rows: string[] = [];

  const dummySrc = {
    url: 'https://id.wikipedia.org/wiki/Mesin_empat_tak',
    title: 'Mesin empat tak',
    quote: 'Mesin empat tak bekerja lewat langkah hisap, kompresi, usaha, dan buang.',
    retrieved_at: new Date().toISOString(),
  };

  // 32. Storyboard mesin dengan rail_cross_section -> SB_ENTITY_OFF_TOPIC
  const sb32: Storyboard = {
    scenes: [
      {
        id: 'S3',
        lane: 'code_3d',
        shot_type: 'cross_section',
        camera_move: 'static',
        duration_sec: 4,
        sentence_refs: ['S3.1'],
        focus_entities: ['rail_cross_section'],
        visible_parts: ['wheel_left'],
        driver: { name: 'crank_angle', unit: '°', from: 0, to: 180 },
        hud: [],
        trigger_words: ['hisap'],
      },
    ],
  };
  const sc32: Script = {
    scenes: [{ id: 'S3', sentences: [{ text: 'Langkah hisap menarik campuran.', claim_refs: ['C1'], emphasis_words: [] }] }],
  };
  const tl32: Timeline = {
    total_sec: 4,
    scenes: [{ scene_id: 'S3', start: 0, end: 4, audio_path: 'a.mp3' }],
    words: [{ text: 'hisap', start: 0.4, end: 0.9, scene_id: 'S3' }],
    beats: [],
    shots: [],
    events: [],
  };
  const led32: FactLedger = {
    claims: [{ id: 'C1', text: 'Langkah hisap menarik campuran.', kind: 'fact', status: 'verified', sources: [dummySrc] }],
  };
  const m32 = verifyStoryboardCode(sb32, sc32, tl32, led32, { domain: 'engine' }).issues.filter((i) =>
    i.message.includes('SB_ENTITY_OFF_TOPIC')
  );
  rows.push(`| mut32-sb-entity-off-topic | L4 | ${m32.length} | ${m32[0]?.message} |`);

  // 33. Adegan mesin mengimpor RailCurveOverlay -> SCENE_COMPONENT_OFF_TOPIC
  const code33 = `import React from 'react';
import { TelemetryProvider, StoryboardHudProvider, BlueprintStage, PistonCrankAssembly, RailCurveOverlay, HudLayout, Hud } from '../../../kit';
export const Scene_S2 = () => (<TelemetryProvider><StoryboardHudProvider items={[]}><BlueprintStage hud={<HudLayout><RailCurveOverlay curveArc inertiaArrow /><Hud id="S2_H1" /></HudLayout>}><PistonCrankAssembly crankAngleDeg={0} /></BlueprintStage></StoryboardHudProvider></TelemetryProvider>);`;
  const m33 = validateSceneCodeSafety(code33, 'engine').errors.filter((e) => e.includes('SCENE_COMPONENT_OFF_TOPIC'));
  rows.push(`| mut33-scene-component-off-topic | scene-safety | ${m33.length} | ${m33[0]} |`);

  // 34. S2 mesin P4E (panah tetap ke atas / unbound) -> VIS_ARROW_UNBOUND / VIS_ARROW_DIRECTION_MISMATCH
  const m34 = analyzeArrowDirectionFromTelemetry([
    {
      frame: 0,
      sec: 0,
      drivers: { crank_angle: { value: 0, unit: '°' } },
      entities: [
        { id: 'piston_crank', role: 'focus', partStates: { piston_y: 2.45 } },
        { id: 'rail_curve_inertia_arrow', role: 'prop', partStates: { arrow_dir_y: -1, bind_to_part: 'unbound', arrow_bound: false } },
      ],
      hud: [],
    },
    {
      frame: 15,
      sec: 0.5,
      drivers: { crank_angle: { value: 180, unit: '°' } },
      entities: [
        { id: 'piston_crank', role: 'focus', partStates: { piston_y: 1.35 } },
        { id: 'rail_curve_inertia_arrow', role: 'prop', partStates: { arrow_dir_y: -1, bind_to_part: 'unbound', arrow_bound: false } },
      ],
      hud: [],
    },
  ]).issues;
  rows.push(`| mut34-s2-p4e-arrow-unbound | visual | ${m34.length} | ${m34[0]?.message} |`);

  // 35. Cakupan kereta P4E -> FAIL (tanpa kalimat khusus)
  const keretaScript = JSON.parse(await readFile(path.join(repoRoot, 'out/review/p4e/p2-kereta/script.json'), 'utf-8')) as Script;
  const keretaLedger = JSON.parse(await readFile(path.join(repoRoot, 'out/review/p4e/p2-kereta/fact-ledger.json'), 'utf-8')) as FactLedger;
  const m35 = checkKeyStepsCoverage(['self-centering', 'geser ke rel luar'], keretaScript, keretaLedger).issues;
  rows.push(`| mut35-kereta-p4e-coverage-fail | L0b | ${m35.length} | ${m35[0]?.message} |`);

  // 36. Callout terpotong "..." -> HUD_TRUNCATED
  const m36 = checkOnscreenTruthFromTelemetry(
    [
      {
        frame: 10,
        sec: 0.33,
        drivers: {},
        entities: [],
        hud: [
          {
            id: 'S3_H1',
            hud_id: 'S3_H1',
            component: 'Callout',
            zone: 'callout',
            bbox: { x: 40, y: 740, width: 560, height: 80 },
            text: 'Hisap — Piston turun menarik udara',
            domText: 'Hisap — Piston turun menarik…',
            truncated: true,
          },
        ],
      },
    ],
    {
      compositionId: 'mut36',
      focusEntities: ['cylinder_section'],
      invariants: [],
      expectedHud: [{ hud_id: 'S3_H1', component: 'Callout', expectedText: 'Hisap — Piston turun menarik udara' }],
    }
  ).filter((i) => i.message.includes('HUD_TRUNCATED'));
  rows.push(`| mut36-hud-truncated | visual | ${m36.length} | ${m36[0]?.message} |`);

  // 37. Adegan memakai Math.random() / useFrame -> FORBIDDEN_API
  const code37 = code33.replace('RailCurveOverlay', 'DiagramOverlay').replace('curveArc inertiaArrow', '').replace('crankAngleDeg={0}', 'crankAngleDeg={Math.random()}');
  const m37 = validateSceneCodeSafety(code37, 'engine').errors.filter((e) => e.includes('FORBIDDEN_API'));
  rows.push(`| mut37-forbidden-api-determinism | scene-safety | ${m37.length} | ${m37[0]} |`);

  // 38. Satu adegan fallback ke Google TTS -> AUDIO_VOICE_MISMATCH
  const tmpTts = await mkdtemp(path.join(os.tmpdir(), 'mut38-'));
  let m38: Array<{ message: string }> = [];
  try {
    await mkdir(path.join(tmpTts, 'audio'), { recursive: true });
    await writeFile(
      path.join(tmpTts, 'audio', 'tts-manifest.json'),
      JSON.stringify([
        { scene_id: 'S1', engine_used: 'msedge-tts', voice_id: 'id-ID-ArdiNeural' },
        { scene_id: 'S2', engine_used: 'google-translate-tts', voice_id: 'id-ID-google' },
      ]),
      'utf-8'
    );
    m38 = (await checkTtsVoiceConsistency(tmpTts)).issues;
  } finally {
    await rm(tmpTts, { recursive: true, force: true });
  }
  rows.push(`| mut38-audio-voice-mismatch | final-audio | ${m38.length} | ${m38[0]?.message} |`);

  // 39. CylinderSection di 450 deg dengan katup buang terbuka -> error telemetri
  const spec39 = buildVisualSpecForScene(
    'Scene_S3',
    {
      id: 'S3',
      lane: 'code_3d',
      shot_type: 'cross_section',
      camera_move: 'static',
      duration_sec: 4,
      sentence_refs: ['S3.1'],
      focus_entities: ['cylinder_section'],
      visible_parts: ['piston', 'intake_valve', 'exhaust_valve'],
      driver: { name: 'crank_angle', unit: '°', from: 0, to: 720 },
      hud: [],
      trigger_words: ['kompresi'],
    },
    0
  );
  const m39 = checkMechanicsFromTelemetry(
    [
      {
        frame: 10,
        sec: 0.33,
        drivers: { crank_angle: { value: 450, unit: '°' } },
        entities: [{ id: 'cylinder_section', role: 'focus', partStates: { intake_valve: 'closed', exhaust_valve: 'open', piston_y: 1.8 } }],
        hud: [],
      },
    ],
    spec39
  ).filter((i) => i.message.includes('MECHANICS_INVARIANT'));
  rows.push(`| mut39-cylinder-section-450-exhaust | mechanics | ${m39.length} | ${m39[0]?.message} |`);

  await writeFile(summaryPath, `${existing.trimEnd()}\n${rows.join('\n')}\n`, 'utf-8');
  console.log(`P4F mutations (1-39) written to ${summaryPath}`);
}

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, 'out', 'review', 'p4f');
runP4FMutations(repoRoot, outDir).catch((e) => {
  console.error(e);
  process.exit(1);
});
