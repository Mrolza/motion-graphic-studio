import { describe, expect, it } from 'vitest';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import type { Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { verifyStoryboardCode } from '@core/qc/storyboard';
import {
  checkHudFormatFromTelemetry,
  checkMechanicsFromTelemetry,
  checkOnscreenTruthFromTelemetry,
  checkSyncFromTelemetry,
} from '@core/qc/visual/checks';
import type { TelemetrySample, VisualCheckSpec } from '@core/qc/visual/types';
import { validateSceneCodeSafety } from '@core/stages/scene-safety';
import { toIndonesianSpokenText } from '@core/stages/voice';
import { formatValueWithUnit } from '../remotion/src/kit/drivers/kinematics';

describe('P3B Voice spoken_text, Storyboard QC, Safety Validator, and Sync Mutations', () => {
  const script: Script = {
    scenes: [
      {
        id: 'S1',
        sentences: [
          {
            text: 'Roda kereta miring 1:20 dengan lebar rel 1.435 mm.',
            claim_refs: ['C1'],
            emphasis_words: ['kerucut'],
          },
        ],
      },
    ],
  };

  const timeline: Timeline = {
    total_sec: 4.5,
    scenes: [{ scene_id: 'S1', start: 0, end: 4.5, audio_path: 'projects/test/audio/S1.mp3' }],
    beats: [],
    shots: [],
    words: [{ text: 'miring', start: 1.0, end: 1.3, scene_id: 'S1' }],
    events: [{ type: 'hook', at: 0 }],
  };

  const ledger: FactLedger = {
    claims: [
      {
        id: 'C1',
        text: 'Roda kereta memiliki kemiringan 1 banding 20.',
        value: 20,
        kind: 'fact',
        status: 'verified',
        sources: [{ url: 'https://en.wikipedia.org/wiki/Wheelset_(rail_transport)', title: 'W', quote: 'taper of about 1 in 20.', retrieved_at: '2026-11-20T00:00:00.000Z' }],
      },
      {
        id: 'C4',
        text: 'Klaim belum terverifikasi.',
        kind: 'fact',
        status: 'unverified',
        sources: [{ url: 'https://wikipedia.org', title: 'R', quote: '...', retrieved_at: '2026-11-20T00:00:00.000Z' }],
      },
    ],
  };

  const validSb: Storyboard = {
    scenes: [
      {
        id: 'S1',
        lane: 'code_3d',
        shot_type: 'closeup',
        camera_move: 'dolly',
        duration_sec: 4.5,
        sentence_refs: ['S1.1'],
        focus_entities: ['wheelset'],
        visible_parts: ['wheel_left', 'wheel_right', 'flange'],
        driver: { name: 'distance', unit: 'm', from: -2, to: 2 },
        hud: [
          {
            hud_id: 'S1_H1',
            component: 'MeasureReveal',
            props: { label: 'Kemiringan', valueText: '1:20' },
            claim_ref: 'C1',
          },
        ],
        trigger_words: ['miring'],
      },
    ],
  };

  it('converts Indonesian display numbers/ratios/degrees to TTS spoken_text', () => {
    expect(toIndonesianSpokenText('Kemiringan 1:20, lebar 1.435 mm, rasio 3,5 dan 720°.')).toBe(
      'Kemiringan 1 banding 20, lebar 1435 mm, rasio 3 koma 5 dan 720 derajat.'
    );
  });

  it('passes valid storyboard and catches Mutations 1-4', () => {
    expect(verifyStoryboardCode(validSb, script, timeline, ledger).issues).toHaveLength(0);

    // Mut 1: HUD number not in ledger
    const mut1: Storyboard = {
      scenes: [{ ...validSb.scenes[0]!, hud: [{ hud_id: 'S1_H1', component: 'MeasureReveal', props: { label: 'Sudut', valueText: '999 mm' }, claim_ref: 'C1' }] }],
    };
    expect(verifyStoryboardCode(mut1, script, timeline, ledger).issues[0]?.message).toContain('SB_HUD_NUMBER_NOT_IN_CLAIM');

    // Mut 2: trigger_words not in narration
    const mut2: Storyboard = {
      scenes: [{ ...validSb.scenes[0]!, trigger_words: ['pesawat'] }],
    };
    expect(verifyStoryboardCode(mut2, script, timeline, ledger).issues[0]?.message).toContain('SB_MISSING_TRIGGER_WORD');

    // Mut 3: 3 HUD panels in one scene
    const mut3: Storyboard = {
      scenes: [
        {
          ...validSb.scenes[0]!,
          hud: [
            { hud_id: 'S1_H1', component: 'MeasureReveal', props: { label: 'A', valueText: '1:20' }, claim_ref: 'C1' },
            { hud_id: 'S1_H2', component: 'Callout', props: { label: 'B' } },
            { hud_id: 'S1_H3', component: 'Callout', props: { label: 'C' } },
          ],
        },
      ],
    };
    expect(verifyStoryboardCode(mut3, script, timeline, ledger).issues[0]?.message).toContain('SB_HUD_BUDGET');

    // Mut 4: claim_ref to unverified claim
    const mut4: Storyboard = {
      scenes: [{ ...validSb.scenes[0]!, hud: [{ hud_id: 'S1_H1', component: 'Callout', props: { label: 'Flens' }, claim_ref: 'C4' }] }],
    };
    expect(verifyStoryboardCode(mut4, script, timeline, ledger).issues[0]?.message).toContain('SB_UNVERIFIED_CLAIM');
  });

  it('catches Mutation 5 (sync delay 1.5s after trigger word)', () => {
    const spec: VisualCheckSpec = {
      compositionId: 'gen-test-S1',
      focusEntities: ['wheelset'],
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
    expect(syncErrs).toHaveLength(1);
    expect(syncErrs[0]?.message).toContain('SYNC_OUT_OF_WINDOW');
  });

  it('validates scene code safety (imports, forbidden APIs, telemetry wrappers)', () => {
    const badCode = `import fs from 'node:fs';\nexport const X = () => { fetch('https://x.com'); return <Callout label="X" />; };`;
    const res = validateSceneCodeSafety(badCode);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('FORBIDDEN_IMPORT'))).toBe(true);
    expect(res.errors.some((e) => e.includes('FORBIDDEN_API'))).toBe(true);
    expect(res.errors.some((e) => e.includes('MISSING_TELEMETRY_WRAPPER'))).toBe(true);
    expect(res.errors.some((e) => e.includes('UNSANCTIONED_HUD_DIRECT_CALL'))).toBe(true);
  });

  it('validates P3C onscreen truth (L5), phase-bound HUD, deg normalization, and shot variation', () => {
    expect(formatValueWithUnit(524, 'deg')).toBe('524°');
    expect(formatValueWithUnit(1435, 'mm')).toBe('1.435 mm');

    const spec: VisualCheckSpec = {
      compositionId: 'gen-test-S1',
      focusEntities: ['piston_crank'],
      invariants: [],
      expectedHud: [
        {
          hud_id: 'S1_H1',
          component: 'MeasureReveal',
          expectedText: 'Lebar rel: 1.435 mm',
          claim_ref: 'C1',
          claimUnit: 'mm',
          claimAllowedNumbers: [1435],
        },
        {
          hud_id: 'S1_H2',
          component: 'Callout',
          expectedText: 'Langkah Usaha',
          when: { driver_between: [360, 540] },
        },
      ],
    };

    const sample: TelemetrySample = {
      frame: 30,
      sec: 1.0,
      drivers: { crank_angle: { value: 620, unit: '°' } },
      entities: [],
      hud: [
        { id: 'extra_hud', hud_id: 'extra_hud', component: 'Callout', zone: 'callout', bbox: { x: 0, y: 0, width: 100, height: 40 }, text: 'Spoor 524 deg' },
        { id: 'S1_H1', hud_id: 'S1_H1', component: 'MeasureReveal', zone: 'callout', bbox: { x: 0, y: 50, width: 100, height: 40 }, text: 'Lebar: 1.435 m' },
        { id: 'S1_H2', hud_id: 'S1_H2', component: 'Callout', zone: 'callout', bbox: { x: 0, y: 100, width: 100, height: 40 }, text: 'Langkah Usaha' },
      ],
    };

    const l5 = checkOnscreenTruthFromTelemetry([sample], spec);
    expect(l5.some((i) => i.message.includes('L5_UNSANCTIONED_HUD'))).toBe(true);
    expect(l5.some((i) => i.message.includes('L5_FACT_MISMATCH'))).toBe(true);
    expect(checkMechanicsFromTelemetry([sample], spec).some((i) => i.message.includes('MECHANICS_HUD_OUT_OF_PHASE'))).toBe(true);
    expect(checkHudFormatFromTelemetry([sample]).some((i) => i.message.includes('HUD_UNNORMALIZED_UNIT'))).toBe(true);
  });
});
