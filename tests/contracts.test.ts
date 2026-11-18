import { describe, expect, it } from 'vitest';
import {
  ALL_STAGES,
  FactLedgerSchema,
  ProjectSchema,
  QcReportSchema,
  ScriptSchema,
  StoryboardSchema,
  TimelineSchema,
} from '@core/contracts';

const validStages = Object.fromEntries(ALL_STAGES.map((s) => [s, 'pending']));
const validCalls = Object.fromEntries(ALL_STAGES.map((s) => [s, 0]));

describe('Core Data Contracts (Zod)', () => {
  it('ProjectSchema accepts valid project and rejects invalid format/duration', () => {
    const valid = {
      id: 'kereta-tidak-tergelincir-20261118',
      created_at: '2026-11-18T12:00:00.000Z',
      topic: 'Kenapa kereta tidak tergelincir?',
      format: 'how_it_works',
      style: 'blueprint',
      palette: 'blueprint-navy',
      target_duration_sec: 45,
      device_profile: 'standar',
      stages: validStages,
      llm_calls: validCalls,
    };
    expect(ProjectSchema.safeParse(valid).success).toBe(true);

    const invalid = { ...valid, format: 'podcast', target_duration_sec: -10 };
    expect(ProjectSchema.safeParse(invalid).success).toBe(false);
  });

  it('FactLedgerSchema accepts valid ledger and rejects claim without sources', () => {
    const valid = {
      claims: [
        {
          id: 'C1',
          text: 'Lebar sepur standar rel kereta api adalah 1.435 mm.',
          value: 1435,
          unit: 'mm',
          kind: 'fact',
          status: 'verified',
          sources: [
            {
              url: 'https://en.wikipedia.org/wiki/Standard-gauge_railway',
              title: 'Standard-gauge railway',
              quote: 'Standard gauge is 1,435 mm (4 ft 8 1/2 in).',
              retrieved_at: '2026-11-18T12:00:00.000Z',
            },
          ],
        },
      ],
    };
    expect(FactLedgerSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      claims: [{ ...valid.claims[0], sources: [] }],
    };
    expect(FactLedgerSchema.safeParse(invalid).success).toBe(false);
  });

  it('ScriptSchema enforces claim_refs unless non_factual is true', () => {
    const valid = {
      scenes: [
        {
          id: 'S1',
          sentences: [
            {
              text: 'Pernah penasaran kenapa kereta tidak keluar jalur?',
              claim_refs: [],
              emphasis_words: ['kereta'],
              non_factual: true,
            },
            {
              text: 'Lebar rel standarnya tepat 1.435 milimeter.',
              claim_refs: ['C1'],
              emphasis_words: ['1.435'],
            },
          ],
        },
      ],
    };
    expect(ScriptSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      scenes: [
        {
          id: 'S1',
          sentences: [
            {
              text: 'Lebar rel standarnya tepat 1.435 milimeter.',
              claim_refs: [],
              emphasis_words: ['1.435'],
            },
          ],
        },
      ],
    };
    expect(ScriptSchema.safeParse(invalid).success).toBe(false);
  });

  it('StoryboardSchema requires claim_ref, bind_to_driver, or illustrative on numeric HUD', () => {
    const valid = {
      scenes: [
        {
          id: 'Scene1',
          lane: 'code_3d',
          duration_sec: 6,
          sentence_refs: ['S1.1'],
          focus_entities: ['piston', 'crankshaft'],
          driver: { name: 'crank_angle', unit: 'deg', from: 0, to: 360 },
          invariants: [
            { entity: 'intake_valve', state: 'open', when: { driver_between: [0, 180] } },
          ],
          hud: [
            {
              component: 'StatCounter',
              props: { from: 0, to: 360, unit: '°' },
              bind_to_driver: true,
            },
          ],
          trigger_words: ['hisap'],
        },
      ],
    };
    expect(StoryboardSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      scenes: [
        {
          ...valid.scenes[0],
          hud: [
            {
              component: 'StatCounter',
              props: { from: 1000, to: 6000, unit: 'RPM' },
            },
          ],
        },
      ],
    };
    expect(StoryboardSchema.safeParse(invalid).success).toBe(false);
  });

  it('TimelineSchema accepts valid timeline and rejects negative total_sec', () => {
    const valid = {
      total_sec: 6.5,
      scenes: [{ scene_id: 'S1', start: 0, end: 6.5, audio_path: 'audio/s1.mp3' }],
      beats: [{ beat_id: 's1b1', scene_id: 'S1', start: 0, end: 6.5 }],
      shots: [{ shot_id: 'sh1', beat_id: 's1b1', scene_id: 'S1', start: 0, end: 6.5, reframe_index: 0 }],
      words: [{ text: 'Kereta', start: 0.1, end: 0.5, scene_id: 'S1' }],
      events: [{ type: 'hook', at: 0 }],
    };
    expect(TimelineSchema.safeParse(valid).success).toBe(true);
    expect(TimelineSchema.safeParse({ ...valid, total_sec: -1 }).success).toBe(false);
  });

  it('QcReportSchema accepts valid report and rejects unknown layer', () => {
    const valid = {
      layer: 'mechanics',
      issues: [{ severity: 'error', message: 'Intake valve closed during intake stroke', ref: 'Scene2' }],
    };
    expect(QcReportSchema.safeParse(valid).success).toBe(true);
    expect(QcReportSchema.safeParse({ ...valid, layer: 'L99' }).success).toBe(false);
  });
});
