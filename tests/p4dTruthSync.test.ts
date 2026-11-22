import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FactClaim, FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema, type Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { computeStableHash } from '@core/llm/budget';
import { aggregateLlmCallStats, formatRenderTiming } from '@core/llm/stats';
import {
  checkCaptionsQc,
  estimateStoryboardCaptionOverlaps,
  formatOverlapScanMarkdown,
  scanTelemetryOverlaps,
} from '@core/qc/captions-qc';
import { checkFinalTechnicalFormat } from '@core/qc/final';
import { verifyScriptL0bAndL3 } from '@core/qc/l0b-quality';
import { verifyLedgerL1 } from '@core/qc/l1-ledger';
import { verifyLedgerL1Semantic } from '@core/qc/l1-semantic';
import { verifyScriptL2 } from '@core/qc/l2-script';
import { verifyStoryboardL5Semantic } from '@core/qc/l5-semantic';
import { verifyNarrationHudSync } from '@core/qc/narration-hud-conflict';
import { QC_RULES_VERSION } from '@core/qc/rules-version';
import { runStoryboardQcStage } from '@core/qc/storyboard';
import { verifyStoryboardCode } from '@core/qc/storyboard-code';
import type { WikipediaSource } from '@core/research/wikipedia';
import { buildKineticCaptions } from '@core/render/kinetic-captions';
import { validatePublishSources } from '@core/stages/publish';

const SOURCE_TRAIN: WikipediaSource = {
  source_id: 'S1',
  title: 'Flanged wheel',
  lang: 'en',
  url: 'https://en.wikipedia.org/wiki/Flanged_wheel',
  text: 'The conical profile keeps the wheelset centered with less chance of the flanges rubbing the rails. Most trains steer around curves without flanges touching.',
  retrieved_at: '2026-11-22T00:00:00.000Z',
};

function makeClaim(overrides: Partial<FactClaim>): FactClaim {
  return {
    id: 'C1',
    text: 'Profil kerucut memberi peluang lebih kecil bagi flens untuk bergesekan dengan rel.',
    kind: 'fact',
    status: 'verified',
    sources: [
      {
        url: SOURCE_TRAIN.url,
        title: SOURCE_TRAIN.title,
        quote: 'The conical profile keeps the wheelset centered with less chance of the flanges rubbing the rails.',
        retrieved_at: SOURCE_TRAIN.retrieved_at,
      },
    ],
    ...overrides,
  };
}

describe('P4D Truth & Sync Gates (0 real Gemini calls)', () => {
  it('Mutasi 17: L1_HEDGE_DROPPED & L1_ABSOLUTE_ADDED reject dropped hedges / added absolutes, allow "tanpa" when quote has "without"', () => {
    const badDrop = makeClaim({
      id: 'C_DROP',
      text: 'Profil kerucut menjaga roda tetap di tengah tanpa flens bergesekan dengan rel.',
    });
    const resDrop = verifyLedgerL1([badDrop], [SOURCE_TRAIN], { C_DROP: 'S1' });
    expect(resDrop.ledger.claims[0]!.status).toBe('unverified');
    expect(resDrop.report.issues.some((i) => i.message.includes('L1_HEDGE_DROPPED'))).toBe(true);
    expect(resDrop.report.issues.some((i) => i.message.includes('L1_ABSOLUTE_ADDED'))).toBe(true);

    const goodHedge = makeClaim({
      id: 'C_OK',
      text: 'Profil kerucut memberi peluang lebih kecil flens bergesekan dengan rel.',
    });
    const resOk = verifyLedgerL1([goodHedge], [SOURCE_TRAIN], { C_OK: 'S1' });
    expect(resOk.ledger.claims[0]!.status).toBe('verified');

    const goodWithout = makeClaim({
      id: 'C_WITHOUT',
      text: 'Sebagian besar kereta berbelok tanpa flens menyentuh rel.',
      sources: [
        {
          url: SOURCE_TRAIN.url,
          title: SOURCE_TRAIN.title,
          quote: 'Most trains steer around curves without flanges touching.',
          retrieved_at: SOURCE_TRAIN.retrieved_at,
        },
      ],
    });
    const resWithout = verifyLedgerL1([goodWithout], [SOURCE_TRAIN], { C_WITHOUT: 'S1' });
    expect(resWithout.ledger.claims[0]!.status).toBe('verified');
  });

  it('Mutasi 18 + A4: L1_EMBELLISHED flags unverified and blocks script, storyboard, and publish.md', async () => {
    const c1 = makeClaim({
      id: 'C1',
      text: 'Profil kerucut membuat kereta melaju lebih hemat bahan bakar.',
    });
    const mockGen = async (_schema: unknown, _prompt: string) => ({
      data: {
        results: [
          {
            id: 'C1',
            status: 'embellished',
            reason: 'Kutipan tidak menyebut hemat bahan bakar',
          },
        ],
      },
      rawText: '{}',
      model: 'mock',
      httpRetries: 0,
    });

    const sem = await verifyLedgerL1Semantic([c1], {
      generateJsonFn: mockGen as never,
    });
    expect(sem.called).toBe(true);
    expect(sem.unverifiedIds.has('C1')).toBe(true);
    expect(sem.issues[0]!.message).toContain('L1_EMBELLISHED');

    const unverifiedLedger: FactLedger = {
      claims: [{ ...c1, status: 'unverified' }],
    };
    const script: Script = {
      scenes: [
        {
          id: 'S1',
          sentences: [{ text: 'Profil kerucut hemat energi.', claim_refs: ['C1'], emphasis_words: [] }],
        },
      ],
    };
    const l2 = verifyScriptL2(script, unverifiedLedger);
    expect(l2.issues.some((i) => i.message.includes('BAD_CLAIM_REF'))).toBe(true);

    const pubCheck = validatePublishSources(
      `Sumber: ${SOURCE_TRAIN.url}`,
      unverifiedLedger
    );
    expect(pubCheck.ok).toBe(false);
    expect(pubCheck.unknownUrls).toContain(SOURCE_TRAIN.url);
  });

  it('A3: verifyScriptL0bAndL3 sends all source quotes to L3 verifier', async () => {
    let capturedPrompt = '';
    const mockGen = async (_schema: unknown, prompt: string) => {
      capturedPrompt = prompt;
      return {
        data: {
          l0b: {
            answers_question: true,
            has_off_topic_scene: false,
            hook_paid: true,
            scores: { answers_direct: 5, coverage: 5, structure: 5, on_topic: 5 },
            issues: [],
          },
          l3: {
            evaluations: [{ ref: 'S1.1', verdict: 'supported', reason: 'ok' }],
          },
        },
        rawText: '{}',
        model: 'mock',
        httpRetries: 0,
      };
    };
    const ledger: FactLedger = {
      claims: [
        makeClaim({
          id: 'C1',
          sources: [
            {
              url: SOURCE_TRAIN.url,
              title: SOURCE_TRAIN.title,
              quote: 'Quote satu.',
              retrieved_at: SOURCE_TRAIN.retrieved_at,
            },
            {
              url: SOURCE_TRAIN.url,
              title: SOURCE_TRAIN.title,
              quote: 'Quote dua tambahan.',
              retrieved_at: SOURCE_TRAIN.retrieved_at,
            },
          ],
        }),
      ],
    };
    const script: Script = {
      scenes: [
        {
          id: 'S1',
          sentences: [{ text: 'Kalimat satu.', claim_refs: ['C1'], emphasis_words: [] }],
        },
      ],
    };
    await verifyScriptL0bAndL3({
      topic: 'Kereta',
      script,
      ledger,
      generateJsonFn: mockGen as never,
    });
    expect(capturedPrompt).toContain('Quote satu.');
    expect(capturedPrompt).toContain('Quote dua tambahan.');
  });

  it('Mutasi 19: Regression scan detects CAPTION_HUD_OVERLAP on legacy P4 kereta storyboard/captions & telemetry scanner emits 0 when separated', () => {
    const p4SbPath = path.join(process.cwd(), 'out', 'review', 'p4', 'p2-kereta', 'storyboard.json');
    const p4TlPath = path.join(process.cwd(), 'projects', 'p2-kereta', 'timeline.json');
    const p4CapPath = path.join(process.cwd(), 'projects', 'p2-kereta', 'captions.json');
    if (existsSync(p4SbPath) && existsSync(p4TlPath) && existsSync(p4CapPath)) {
      const sb = StoryboardSchema.parse(JSON.parse(readFileSync(p4SbPath, 'utf-8')));
      const tl = JSON.parse(readFileSync(p4TlPath, 'utf-8')) as Timeline;
      const chunks = JSON.parse(readFileSync(p4CapPath, 'utf-8')) as ReturnType<
        typeof buildKineticCaptions
      >;
      const scan = estimateStoryboardCaptionOverlaps({
        storyboard: sb,
        timeline: tl,
        chunks,
        stepFrames: 5,
        calloutTopY: 790,
        captionTopY: 942,
      });
      expect(scan.overlaps.length).toBeGreaterThan(0);
      expect(scan.overlaps.some((o) => o.sec >= 6 && o.sec <= 26)).toBe(true);
    }

    // Telemetry scanner catches overlap when y ranges intersect, passes when separated
    const overlapping = scanTelemetryOverlaps([
      {
        frame: 210,
        sec: 7.0,
        drivers: {},
        entities: [],
        hud: [
          { id: '__kit_captions', component: 'KineticCaptions', zone: 'caption', text: 'cap', bbox: { x: 82, y: 942, width: 556, height: 76 } },
          { id: 'S2_H2', component: 'Callout', zone: 'callout', text: 'call', bbox: { x: 48, y: 790, width: 560, height: 170 } },
        ],
      },
    ]);
    expect(overlapping.overlaps.length).toBe(1);

    const clean = scanTelemetryOverlaps([
      {
        frame: 210,
        sec: 7.0,
        drivers: {},
        entities: [],
        hud: [
          { id: '__kit_captions', component: 'KineticCaptions', zone: 'caption', text: 'cap', bbox: { x: 82, y: 935, width: 556, height: 74 } },
          { id: 'S2_H2', component: 'Callout', zone: 'callout', text: 'call', bbox: { x: 48, y: 740, width: 560, height: 140 } },
        ],
      },
    ]);
    expect(clean.overlaps.length).toBe(0);
    expect(formatOverlapScanMarkdown('test', clean)).toContain('**0**');
  });

  it('Mutasi 20 & 21: L5_NARRATION_HUD_CONFLICT & HUD_DUPLICATES_CAPTION', () => {
    const script: Script = {
      scenes: [
        {
          id: 'S1',
          sentences: [
            {
              text: 'Profil kerucut memberi peluang lebih kecil flens menyentuh rel.',
              claim_refs: ['C1'],
              emphasis_words: [],
            },
          ],
        },
      ],
    };
    const storyboard: Storyboard = {
      scenes: [
        {
          id: 'S1',
          lane: 'code_3d',
          shot_type: 'establishing',
          camera_move: 'dolly',
          duration_sec: 5,
          sentence_refs: ['S1.1'],
          focus_entities: ['train_car'],
          visible_parts: ['body'],
          hud: [
            {
              hud_id: 'S1_H1',
              component: 'Callout',
              props: { label: 'Tanpa Gesekan', detail: 'Flens tidak pernah menyentuh rel' },
              claim_ref: 'C1',
            },
            {
              hud_id: 'S1_H2',
              component: 'KineticTitle',
              props: { title: 'Profil kerucut memberi peluang lebih kecil flens menyentuh rel' },
              illustrative: true,
            },
          ],
          trigger_words: ['kerucut'],
        },
      ],
    };
    const res = verifyNarrationHudSync({ script, storyboard });
    expect(res.issues.some((i) => i.message.includes('L5_NARRATION_HUD_CONFLICT'))).toBe(true);
    expect(res.issues.some((i) => i.message.includes('HUD_DUPLICATES_CAPTION'))).toBe(true);
  });

  it('Mutasi 22: Multi-claim HUD claim_refs validated in storyboard-code & l5-semantic', async () => {
    const ledger: FactLedger = {
      claims: [
        makeClaim({ id: 'C1', text: 'Langkah 1 hisap terjadi 180 derajat.', value: 180, sources: [{ url: SOURCE_TRAIN.url, title: SOURCE_TRAIN.title, quote: 'Intake 180 degrees.', retrieved_at: SOURCE_TRAIN.retrieved_at }] }),
        makeClaim({ id: 'C2', text: 'Langkah 2 kompresi pada 360 derajat.', value: 360, sources: [{ url: SOURCE_TRAIN.url, title: SOURCE_TRAIN.title, quote: 'Compression 360 degrees.', retrieved_at: SOURCE_TRAIN.retrieved_at }] }),
      ],
    };
    const script: Script = {
      scenes: [{ id: 'S1', sentences: [{ text: 'Dua langkah.', claim_refs: ['C1', 'C2'], emphasis_words: [] }] }],
    };
    const timeline: Timeline = {
      total_sec: 5,
      scenes: [{ scene_id: 'S1', start: 0, end: 5, audio_path: 'a.wav' }],
      events: [],
      beats: [],
      shots: [],
      words: [],
    };
    const sb: Storyboard = {
      scenes: [
        {
          id: 'S1',
          lane: 'code_3d',
          shot_type: 'establishing',
          camera_move: 'dolly',
          duration_sec: 5,
          sentence_refs: ['S1.1'],
          focus_entities: ['engine_block'],
          visible_parts: ['block'],
          hud: [
            {
              hud_id: 'S1_H1',
              component: 'CompareCard',
              props: { leftTitle: 'Hisap', leftValue: '180°', rightTitle: 'Kompresi', rightValue: '360°' },
              claim_ref: 'C1',
              claim_refs: ['C2'],
            },
          ],
          trigger_words: ['langkah'],
        },
      ],
    };
    const codeRep = verifyStoryboardCode(sb, script, timeline, ledger);
    expect(codeRep.issues.filter((i) => i.severity === 'error')).toHaveLength(0);

    let capturedPrompt = '';
    await verifyStoryboardL5Semantic({
      topic: 'Mesin',
      storyboard: sb,
      ledger,
      generateJsonFn: (async (_s: unknown, p: string) => {
        capturedPrompt = p;
        return { data: { items: [{ hud_id: 'S1_H1', verdict: 'OK', reason: 'ok' }] }, rawText: '{}', model: 'mock', httpRetries: 0 };
      }) as never,
    });
    expect(capturedPrompt).toContain('Intake 180 degrees.');
    expect(capturedPrompt).toContain('Compression 360 degrees.');
  });

  it('Mutasi 23: FINAL_PIXFMT rejects yuv444p and yuvj420p, passes yuv420p', () => {
    const bad444 = checkFinalTechnicalFormat({
      width: 720,
      height: 1280,
      fps: 30,
      videoCodec: 'h264',
      pixFmt: 'yuv444p',
      audioCodec: 'aac',
      audioSampleRate: 48000,
    });
    expect(bad444.some((i) => i.message.includes('FINAL_PIXFMT'))).toBe(true);

    const badYuvj = checkFinalTechnicalFormat({
      width: 720,
      height: 1280,
      fps: 30,
      videoCodec: 'h264',
      pixFmt: 'yuvj420p',
      audioCodec: 'aac',
      audioSampleRate: 48000,
    });
    expect(badYuvj.some((i) => i.message.includes('FINAL_PIXFMT'))).toBe(true);

    const good = checkFinalTechnicalFormat({
      width: 720,
      height: 1280,
      fps: 30,
      videoCodec: 'h264',
      pixFmt: 'yuv420p',
      audioCodec: 'aac',
      audioSampleRate: 48000,
    });
    expect(good).toHaveLength(0);
  });

  it('C1, C3, C4: QC_RULES_VERSION invalidates hash, stats aggregates runs & reused chunks, L5 semantic cached 1 call per storyboard version', async () => {
    expect(computeStableHash({ rulesVersion: QC_RULES_VERSION })).not.toBe(
      computeStableHash({ rulesVersion: 'old-v0' })
    );
    expect(formatRenderTiming(0, 4, 4)).toBe('dipakai ulang');

    const tmpRoot = path.join(tmpdir(), `mgs-p4d-test-${Date.now()}`);
    const projId = 'test-c4';
    const projDir = path.join(tmpRoot, 'projects', projId);
    mkdirSync(path.join(projDir, 'qc'), { recursive: true });

    writeFileSync(
      path.join(projDir, 'llm-calls.jsonl'),
      [
        JSON.stringify({ ts: 't1', run_id: 'r1', stage: 'S2', purpose: 'extract', scene_id: null, attempt: 1, http_retries: 0, ok: true }),
        JSON.stringify({ ts: 't2', run_id: 'r1', stage: 'S7', purpose: 'l5_semantic', scene_id: null, attempt: 1, http_retries: 0, ok: true }),
        JSON.stringify({ ts: 't3', run_id: 'r2', stage: 'S8', purpose: 'scene_gen', scene_id: 'S1', attempt: 1, http_retries: 0, ok: true }),
      ].join('\n'),
      'utf-8'
    );
    const stats = await aggregateLlmCallStats(projDir);
    expect(stats.totalCalls).toBe(3);
    expect(stats.totalRuns).toBe(2);
    expect(stats.maxCallsPerRun).toBe(2);
    expect(stats.callsByStage.S2).toBe(1);

    writeFileSync(
      path.join(projDir, 'project.json'),
      JSON.stringify({
        id: projId,
        topic: 'Kereta',
        format: 'how_it_works',
        style: 'blueprint',
        palette: 'blueprint-navy',
        target_duration_sec: 35,
        device_profile: 'standar',
        status: 'draft',
        llm_calls: {},
        stages: { S1: 'done', S2: 'done', S3: 'done', S4: 'done', S5: 'done', S6: 'done', S7: 'pending', S8: 'pending', S9: 'pending', S10: 'pending', S11: 'pending', S12: 'pending' },
        created_at: '2026-11-22T00:00:00.000Z',
        updated_at: '2026-11-22T00:00:00.000Z',
      }),
      'utf-8'
    );
    writeFileSync(
      path.join(projDir, 'fact-ledger.json'),
      JSON.stringify({ topic: 'Kereta', claims: [makeClaim({ id: 'C1' })] }),
      'utf-8'
    );
    writeFileSync(
      path.join(projDir, 'script.json'),
      JSON.stringify({
        topic: 'Kereta',
        target_duration_sec: 35,
        scenes: [{ id: 'S1', narration_role: 'explain', sentences: [{ text: 'Kerucut.', claim_refs: ['C1'] }] }],
      }),
      'utf-8'
    );
    writeFileSync(
      path.join(projDir, 'timeline.json'),
      JSON.stringify({
        total_duration_sec: 5,
        total_sec: 5,
        scenes: [{ id: 'S1', scene_id: 'S1', start: 0, end: 5, start_sec: 0, end_sec: 5, words: [] }],
      }),
      'utf-8'
    );
    const sb: Storyboard = {
      scenes: [
        {
          id: 'S1',
          lane: 'code_3d',
          shot_type: 'establishing',
          camera_move: 'dolly',
          duration_sec: 5,
          sentence_refs: ['S1.1'],
          focus_entities: ['train_car'],
          visible_parts: ['body'],
          hud: [{ hud_id: 'S1_H1', component: 'Callout', props: { label: 'Kerucut', detail: 'Peluang lebih kecil' }, claim_ref: 'C1' }],
          trigger_words: ['kerucut'],
        },
      ],
    };
    writeFileSync(path.join(projDir, 'storyboard.json'), JSON.stringify(sb), 'utf-8');

    let l5Calls = 0;
    const mockGen = async (_schema: unknown, _prompt: string, opts: { purpose?: string }) => {
      if (opts.purpose === 'l5_semantic') {
        l5Calls++;
        return { data: { items: [{ hud_id: 'S1_H1', verdict: 'OK', reason: 'ok' }] }, rawText: '{}', model: 'mock', httpRetries: 0 };
      }
      return { data: { consistent: true, issues: [] }, rawText: '{}', model: 'mock', httpRetries: 0 };
    };

    await runStoryboardQcStage(projId, tmpRoot, { generateJsonFn: mockGen as never });
    expect(l5Calls).toBe(1);

    // Second run with same storyboard -> 0 new l5_semantic calls
    await runStoryboardQcStage(projId, tmpRoot, { generateJsonFn: mockGen as never });
    expect(l5Calls).toBe(1);

    rmSync(tmpRoot, { recursive: true, force: true });
  });
});
