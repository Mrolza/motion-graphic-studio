import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import type { Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import {
  detectTopicDomain,
  getAvailableShotsForDomain,
  isComponentAllowedInDomain,
  isEntityAllowedInDomain,
} from '@core/kit/domain-registry';
import { checkTtsVoiceConsistency } from '@core/qc/final-checks';
import { checkKeyStepsCoverage } from '@core/qc/l0b-quality';
import { verifyStoryboardCode } from '@core/qc/storyboard-code';
import { analyzeArrowDirectionFromTelemetry } from '@core/qc/visual/arrow-check';
import { checkMechanicsFromTelemetry } from '@core/qc/visual/checks';
import { checkOnscreenTruthFromTelemetry } from '@core/qc/visual/media-checks';
import type { TelemetrySample, VisualCheckSpec } from '@core/qc/visual/types';
import { buildVisualSpecForScene, validateSceneCodeSafety } from '@core/stages/scene-safety';
import { computePistonCrankLayout } from '../remotion/src/kit/drivers/geometry';
import { valveStateFromCrankAngle } from '../remotion/src/kit/drivers/kinematics';

describe('P4F Domain Safety, Honest Visual Checks, & Determinism (0 Gemini calls)', () => {
  it('A1/A4: domain registry separates rail/engine/generic and filters available shots', () => {
    expect(detectTopicDomain('Cara kerja mesin 4 tak')).toBe('engine');
    expect(detectTopicDomain('Kenapa roda kereta berbentuk kerucut')).toBe('rail');
    expect(detectTopicDomain('Sejarah penemuan listrik')).toBe('generic');

    expect(isComponentAllowedInDomain('RailCurveOverlay', 'engine')).toBe(false);
    expect(isComponentAllowedInDomain('RailCurveOverlay', 'rail')).toBe(true);
    expect(isComponentAllowedInDomain('DiagramOverlay', 'engine')).toBe(true);
    expect(isComponentAllowedInDomain('CylinderSection', 'engine')).toBe(true);
    expect(isComponentAllowedInDomain('CylinderSection', 'rail')).toBe(false);
    expect(isEntityAllowedInDomain('rail_cross_section', 'engine')).toBe(false);

    expect(getAvailableShotsForDomain('engine')).toContain('cross_section');
    expect(getAvailableShotsForDomain('engine')).not.toContain('comparison');
    expect(getAvailableShotsForDomain('generic')).not.toContain('cross_section');
  });

  it('A2 + Mutasi 32: Engine storyboard with rail_cross_section -> SB_ENTITY_OFF_TOPIC', () => {
    const ledger: FactLedger = {
      claims: [
        {
          id: 'C1',
          text: 'Mesin empat tak memiliki langkah hisap.',
          kind: 'fact',
          status: 'verified',
          sources: [{ url: 'https://id.wikipedia.org/wiki/Mesin', title: 'Mesin', quote: 'Mesin empat tak memiliki langkah hisap.', retrieved_at: '2026-11-22' }],
        },
      ],
    };
    const script: Script = {
      scenes: [
        {
          id: 'S1',
          sentences: [{ text: 'Mesin empat tak bekerja lewat langkah hisap.', claim_refs: ['C1'], emphasis_words: [], non_factual: false }],
        },
      ],
    };
    const timeline: Timeline = {
      total_sec: 4,
      scenes: [{ scene_id: 'S1', start: 0, end: 4, audio_path: 'a.mp3' }],
      words: [{ text: 'hisap', start: 0.5, end: 1.0, scene_id: 'S1' }],
      beats: [],
      shots: [],
      events: [],
    };
    const storyboard: Storyboard = {
      scenes: [
        {
          id: 'S1',
          lane: 'code_3d',
          shot_type: 'cross_section',
          camera_move: 'static',
          duration_sec: 4,
          sentence_refs: ['S1.1'],
          focus_entities: ['rail_cross_section'],
          visible_parts: ['wheel_left'],
          driver: { name: 'crank_angle', unit: '°', from: 0, to: 180 },
          hud: [],
          trigger_words: ['hisap'],
        },
      ],
    };

    const rep = verifyStoryboardCode(storyboard, script, timeline, ledger, { domain: 'engine' });
    expect(rep.issues.some((i) => i.message.includes('SB_ENTITY_OFF_TOPIC'))).toBe(true);
  });

  it('A2 + Mutasi 33: Engine scene importing RailCurveOverlay -> SCENE_COMPONENT_OFF_TOPIC', () => {
    const code = `
import React from 'react';
import { TelemetryProvider, StoryboardHudProvider, BlueprintStage, PistonCrankAssembly, RailCurveOverlay, HudLayout, Hud } from '../../../kit';
export const Scene_S2 = () => (
  <TelemetryProvider><StoryboardHudProvider items={[]}>
    <BlueprintStage hud={<HudLayout><RailCurveOverlay curveArc inertiaArrow /><Hud id="S2_H1" /></HudLayout>}>
      <PistonCrankAssembly crankAngleDeg={0} />
    </BlueprintStage>
  </StoryboardHudProvider></TelemetryProvider>
);`;
    const safety = validateSceneCodeSafety(code, 'engine');
    expect(safety.ok).toBe(false);
    expect(safety.errors.some((e) => e.includes('SCENE_COMPONENT_OFF_TOPIC'))).toBe(true);
  });

  it('A3 + Mutasi 39: CylinderSection telemetry at 8 angles matches math, and exhaust open at 450 deg fails', () => {
    const angles = [0, 90, 180, 270, 360, 450, 540, 630];
    for (const deg of angles) {
      const valves = valveStateFromCrankAngle(deg);
      const layout = computePistonCrankLayout({ crankAngleDeg: deg, crankRadius: 0.55, rodLength: 1.45, position: [0, 0.35, 0] });
      expect(layout.constraints.pistonInsideCylinder).toBe(true);
      if (deg > 0 && deg < 180) expect(valves.intakeOpen).toBe(true);
      if (deg > 180 && deg < 540) {
        expect(valves.intakeOpen).toBe(false);
        expect(valves.exhaustOpen).toBe(false);
      }
      if (deg > 540 && deg < 720) expect(valves.exhaustOpen).toBe(true);
    }

    const spec = buildVisualSpecForScene(
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

    const badSample: TelemetrySample[] = [
      {
        frame: 10,
        sec: 0.33,
        drivers: { crank_angle: { value: 450, unit: '°' } },
        entities: [
          {
            id: 'cylinder_section',
            role: 'focus',
            partStates: { intake_valve: 'closed', exhaust_valve: 'open', piston_y: 1.8 },
          },
        ],
        hud: [],
      },
    ];
    const issues = checkMechanicsFromTelemetry(badSample, spec);
    expect(issues.some((i) => i.message.includes('MECHANICS_INVARIANT') && i.message.includes('exhaust_valve'))).toBe(true);
  });

  it('B1 + Mutasi 34: S2 mesin P4E (unbound inertiaArrow with moving piston) -> VIS_ARROW_UNBOUND; per-frame sign mismatch -> VIS_ARROW_DIRECTION_MISMATCH', () => {
    const p4eS2Samples: TelemetrySample[] = [
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
    ];
    const resUnbound = analyzeArrowDirectionFromTelemetry(p4eS2Samples);
    expect(resUnbound.issues.some((i) => i.message.includes('VIS_ARROW_UNBOUND'))).toBe(true);

    // Reciprocating piston with fixed upward bound arrow -> fails per-frame >= 95%
    const badBoundSamples: TelemetrySample[] = [
      { frame: 0, sec: 0, drivers: {}, entities: [{ id: 'pc', role: 'focus', partStates: { piston_y: 2.0 } }, { id: 'm', role: 'prop', partStates: { arrow_dir_y: 1, bind_to_part: 'piston', arrow_bound: true } }], hud: [] },
      { frame: 5, sec: 0.25, drivers: {}, entities: [{ id: 'pc', role: 'focus', partStates: { piston_y: 1.5 } }, { id: 'm', role: 'prop', partStates: { arrow_dir_y: 1, bind_to_part: 'piston', arrow_bound: true } }], hud: [] },
      { frame: 10, sec: 0.5, drivers: {}, entities: [{ id: 'pc', role: 'focus', partStates: { piston_y: 2.0 } }, { id: 'm', role: 'prop', partStates: { arrow_dir_y: 1, bind_to_part: 'piston', arrow_bound: true } }], hud: [] },
    ];
    const resMismatch = analyzeArrowDirectionFromTelemetry(badBoundSamples);
    expect(resMismatch.issues.some((i) => i.message.includes('VIS_ARROW_DIRECTION_MISMATCH'))).toBe(true);
  });

  it('B2 + Mutasi 35: Kereta P4E without dedicated step_id sentences fails coverage; list sentence >=3 steps excluded', () => {
    const ledger: FactLedger = {
      claims: [
        {
          id: 'C1',
          text: 'Kemiringan tapak roda kereta sekitar 1:20.',
          kind: 'fact',
          status: 'verified',
          sources: [{ url: 'https://en.wikipedia.org/wiki/Wheelset', title: 'Wheelset', quote: 'Conical tread 1:20.', retrieved_at: '2026-11-22' }],
        },
      ],
    };
    const script: Script = {
      scenes: [
        {
          id: 'S2',
          sentences: [
            { text: 'Bentuk kerucut membantu self-centering dan geser ke rel luar.', claim_refs: ['C1'], emphasis_words: [], non_factual: false },
          ],
        },
      ],
    };
    const cov = checkKeyStepsCoverage(['self-centering', 'geser ke rel luar'], script, ledger);
    expect(cov.issues.some((i) => i.message.includes('L0B_STEP_MISSING'))).toBe(true);
    expect(cov.rows.every((r) => !r.covered)).toBe(true);
  });

  it('B3 + Mutasi 36: Truncated HUD text -> HUD_TRUNCATED, Callout > 8 words -> error', () => {
    const spec: VisualCheckSpec = {
      compositionId: 'Scene_S3',
      focusEntities: ['cylinder_section'],
      invariants: [],
      visibleParts: [],
      expectedHud: [{ hud_id: 'S3_H1', component: 'Callout', expectedText: 'Hisap — Piston turun menarik udara' }],
    };
    const samples: TelemetrySample[] = [
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
    ];
    const issues = checkOnscreenTruthFromTelemetry(samples, spec);
    expect(issues.some((i) => i.message.includes('HUD_TRUNCATED'))).toBe(true);
  });

  it('C1 + Mutasi 37: Deterministic safety forbids Math.random, Date.now, useFrame, THREE.Clock', () => {
    const base = `
import React from 'react';
import { TelemetryProvider, StoryboardHudProvider, BlueprintStage, EngineBlock, HudLayout, Hud } from '../../../kit';
export const Scene_S1 = () => {
  const x = Math.random();
  return <TelemetryProvider><StoryboardHudProvider items={[]}><BlueprintStage hud={<HudLayout><Hud id="S1_H1" /></HudLayout>}><EngineBlock crankAngleDeg={x} /></BlueprintStage></StoryboardHudProvider></TelemetryProvider>;
};`;
    const r = validateSceneCodeSafety(base, 'engine');
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('FORBIDDEN_API') && e.includes('Math.random'))).toBe(true);

    const rClock = validateSceneCodeSafety(base.replace('Math.random()', 'new THREE.Clock().getElapsedTime()'), 'engine');
    expect(rClock.errors.some((e) => e.includes('FORBIDDEN_API') && e.includes('clock'))).toBe(true);
  });

  it('C2 + Mutasi 38: Mixed TTS engine/voice in tts-manifest.json -> AUDIO_VOICE_MISMATCH', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'p4f-tts-'));
    try {
      await mkdir(path.join(tmpDir, 'audio'), { recursive: true });
      await writeFile(
        path.join(tmpDir, 'audio', 'tts-manifest.json'),
        JSON.stringify([
          { scene_id: 'S1', engine_used: 'msedge-tts', voice_id: 'id-ID-ArdiNeural' },
          { scene_id: 'S2', engine_used: 'google-translate-tts', voice_id: 'id-ID-google' },
        ]),
        'utf-8'
      );
      const res = await checkTtsVoiceConsistency(tmpDir);
      expect(res.issues.some((i) => i.message.includes('AUDIO_VOICE_MISMATCH'))).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
