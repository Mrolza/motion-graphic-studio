import { describe, expect, it } from 'vitest';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import type { Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { precheckAbsoluteWords } from '@core/qc/l5-semantic';
import { verifyStoryboardCode } from '@core/qc/storyboard';
import { checkFramingFromTelemetry, checkVisibilityFromTelemetry } from '@core/qc/visual/checks';
import { checkOnscreenTruthFromTelemetry } from '@core/qc/visual/media-checks';
import type { TelemetrySample } from '@core/qc/visual/types';
import { validateSceneCodeSafety } from '@core/stages/scene-safety';
import { computeWheelsetLayout } from '../remotion/src/kit/drivers/geometry';

const ledger: FactLedger = {
  claims: [
    {
      id: 'C1',
      kind: 'fact',
      text: 'Kemiringan tapak 1 banding 20',
      value: 20,
      status: 'verified',
      sources: [{ title: 'Wiki', url: 'https://example.com', quote: 'taper of about 1 in 20 with less chance of flange contact', retrieved_at: '2026-11-20' }],
    },
  ],
};

const script: Script = {
  scenes: [
    { id: 'S1', sentences: [{ text: 'Kereta melaju di tikungan.', claim_refs: ['C1'], emphasis_words: [] }] },
    { id: 'S2', sentences: [{ text: 'Penampang roda kerucut.', claim_refs: ['C1'], emphasis_words: [] }] },
    { id: 'S3', sentences: [{ text: 'Ringkasan diameter efektif.', claim_refs: ['C1'], emphasis_words: [] }] },
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
    { scene_id: 'S1', text: 'Kereta', start: 0.1, end: 0.5 },
    { scene_id: 'S2', text: 'Penampang', start: 4.1, end: 4.5 },
    { scene_id: 'S3', text: 'Ringkasan', start: 8.1, end: 8.5 },
  ],
};

describe('P4 Part A — On-screen truth, cross-section & framing', () => {
  it('catches L5_DRIVER_LABEL_MISMATCH and L5_UNSOURCED_DRIVER_VALUE in storyboard and telemetry', () => {
    const sb: Storyboard = {
      scenes: [
        {
          id: 'S1',
          lane: 'code_3d',
          shot_type: 'establishing',
          duration_sec: 4,
          sentence_refs: ['S1.1'],
          focus_entities: ['train_car'],
          driver: { name: 'lateralShift', unit: 'mm', from: 0, to: 15 },
          hud: [
            {
              hud_id: 'S1_H1',
              component: 'StatCounter',
              props: { label: 'Diameter Efektif' },
              bind_to_driver: true,
              quantity: 'lateral_shift',
              display: 'value',
            },
          ],
          trigger_words: ['Kereta'],
        },
        {
          id: 'S2',
          lane: 'code_3d',
          shot_type: 'cross_section',
          view: 'section',
          duration_sec: 4,
          sentence_refs: ['S2.1'],
          focus_entities: ['rail_cross_section'],
          hud: [{ hud_id: 'S2_H1', component: 'MeasureReveal', props: { label: 'Tapak', valueText: '1:20' }, claim_ref: 'C1' }],
          trigger_words: ['Penampang'],
        },
        {
          id: 'S3',
          lane: 'code_3d',
          shot_type: 'summary',
          duration_sec: 4,
          sentence_refs: ['S3.1'],
          focus_entities: ['train_car'],
          hud: [{ hud_id: 'S3_H1', component: 'KineticTitle', props: { title: 'Ringkasan' }, illustrative: true }],
          trigger_words: ['Ringkasan'],
        },
      ],
    };

    const rep = verifyStoryboardCode(sb, script, timeline, ledger);
    expect(rep.issues.some((i) => i.message.includes('L5_DRIVER_LABEL_MISMATCH'))).toBe(true);
    expect(rep.issues.some((i) => i.message.includes('L5_UNSOURCED_DRIVER_VALUE'))).toBe(true);

    const sample: TelemetrySample = {
      frame: 0,
      sec: 0,
      drivers: { lateralShift: { value: 8, unit: 'mm' } },
      entities: [],
      hud: [
        {
          id: 'S1_H1',
          hud_id: 'S1_H1',
          component: 'StatCounter',
          zone: 'callout',
          bbox: { x: 40, y: 860, width: 300, height: 60 },
          text: 'Diameter Efektif: 8 mm',
          numericValue: 8,
        },
      ],
    };
    const l5Issues = checkOnscreenTruthFromTelemetry([sample], {
      compositionId: 'test',
      focusEntities: ['train_car'],
      invariants: [],
      expectedHud: [
        {
          hud_id: 'S1_H1',
          component: 'StatCounter',
          expectedText: 'Diameter Efektif',
          bind_to_driver: true,
          quantity: 'lateral_shift',
          display: 'value',
        },
      ],
    });
    expect(l5Issues.some((i) => i.message.includes('L5_DRIVER_LABEL_MISMATCH'))).toBe(true);
    expect(l5Issues.some((i) => i.message.includes('L5_UNSOURCED_DRIVER_VALUE'))).toBe(true);
  });

  it('flags L5_ABSOLUTE_WORD when HUD uses absolute terms against hedged quotes', () => {
    const hints = precheckAbsoluteWords(
      'Mengikuti tikungan tanpa flens bergesekan',
      'with less chance of the wheel flanges coming in contact'
    );
    expect(hints.some((h) => h.includes('L5_ABSOLUTE_WORD'))).toBe(true);
  });

  it('catches SHOT_VIEW_MISMATCH, VIS_EXAGGERATION_UNLABELED, and checks outer > inner effective radius', () => {
    const sb: Storyboard = {
      scenes: [
        {
          id: 'S1',
          lane: 'code_3d',
          shot_type: 'establishing',
          duration_sec: 4,
          sentence_refs: ['S1.1'],
          focus_entities: ['train_car'],
          hud: [{ hud_id: 'S1_H1', component: 'KineticTitle', props: { title: 'Intro' }, illustrative: true }],
          trigger_words: ['Kereta'],
        },
        {
          id: 'S2',
          lane: 'code_3d',
          shot_type: 'cross_section',
          duration_sec: 4,
          sentence_refs: ['S2.1'],
          focus_entities: ['wheelset'],
          hud: [{ hud_id: 'S2_H1', component: 'Callout', props: { label: 'Tapak' }, illustrative: true }],
          trigger_words: ['Penampang'],
        },
        {
          id: 'S3',
          lane: 'code_3d',
          shot_type: 'summary',
          duration_sec: 4,
          sentence_refs: ['S3.1'],
          focus_entities: ['train_car'],
          hud: [{ hud_id: 'S3_H1', component: 'KineticTitle', props: { title: 'Akhir' }, illustrative: true }],
          trigger_words: ['Ringkasan'],
        },
      ],
    };
    const rep = verifyStoryboardCode(sb, script, timeline, ledger);
    expect(rep.issues.some((i) => i.message.includes('SHOT_VIEW_MISMATCH'))).toBe(true);

    const visIssues = checkVisibilityFromTelemetry(
      [
        {
          frame: 0,
          sec: 0,
          drivers: {},
          entities: [{ id: 'rail_cross_section', role: 'focus', partStates: { taper_exaggeration: 5 } }],
          hud: [],
        },
      ],
      { compositionId: 'test', focusEntities: ['rail_cross_section'], invariants: [] }
    );
    expect(visIssues.some((i) => i.message.includes('VIS_EXAGGERATION_UNLABELED'))).toBe(true);

    const shifted = computeWheelsetLayout({ distance: 0, lateralShift: 0.03 });
    expect(shifted.rightEffectiveRadius).toBeGreaterThan(shifted.leftEffectiveRadius);
  });

  it('enforces 30% framing error for establishing/summary and forbids manual CameraRig distance', () => {
    const framingIssues = checkFramingFromTelemetry(
      [
        {
          frame: 0,
          sec: 0,
          drivers: {},
          entities: [{ id: 'train_car', role: 'focus', bbox: { x: 260, y: 400, width: 200, height: 300 } }],
          hud: [],
        },
      ],
      {
        compositionId: 'test',
        focusEntities: ['train_car'],
        invariants: [],
        minSubjectFillRatio: 0.3,
        requireFillError: true,
      }
    );
    expect(framingIssues.some((i) => i.severity === 'error' && i.message.includes('FRAMING_TOO_SMALL'))).toBe(true);

    const safety = validateSceneCodeSafety(`
      import { TelemetryProvider, BlueprintStage, CameraRig, TrainCar, StoryboardHudProvider, Hud } from '@kit/index';
      export const S = () => (
        <TelemetryProvider><StoryboardHudProvider><BlueprintStage hud={<Hud id="H1" />}>
          <CameraRig mode="frameEntities" from={[1,2,3]} />
          <TrainCar />
        </BlueprintStage></StoryboardHudProvider></TelemetryProvider>
      );
    `);
    expect(safety.ok).toBe(false);
    expect(safety.errors.some((e) => e.includes('CAMERA_MANUAL_DISTANCE'))).toBe(true);
  });
});
