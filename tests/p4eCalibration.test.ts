import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FactClaim, FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import type { Storyboard } from '@core/contracts/storyboard';
import { aggregateLlmCallStats } from '@core/llm/stats';
import { checkKeyStepsCoverage } from '@core/qc/l0b-quality';
import { verifyLedgerL1 } from '@core/qc/l1-ledger';
import { reparaphraseFailedClaims } from '@core/qc/l1-semantic';
import { verifyScriptL2 } from '@core/qc/l2-script';
import { checkHudSpelling } from '@core/qc/spellcheck-id';
import { runStoryboardQcStage } from '@core/qc/storyboard';
import { verifyStoryboardCode } from '@core/qc/storyboard-code';
import { checkMechanicsFromTelemetry } from '@core/qc/visual/checks';
import type { WikipediaSource } from '@core/research/wikipedia';
import { validatePublishHedges } from '@core/stages/publish';
import { runStoryboardStage } from '@core/stages/storyboard';

const TRAIN_SOURCE: WikipediaSource = {
  source_id: 'S1',
  title: 'Wheelset (rail transport)',
  lang: 'en',
  url: 'https://en.wikipedia.org/wiki/Wheelset_(rail_transport)',
  text: 'Most train wheels have a conical taper of about 1 in 20 to enable the wheelset to follow curves with less chance of the wheel flanges coming in contact with the rail sides, and to reduce curve resistance. Without the conical shape, a wheel would tend to continue in a straight path due to the inertia of the rail vehicle, causing the wheelset to move towards the outer rail on the curve.',
  retrieved_at: '2026-11-22T01:43:51.496Z',
};

describe('P4E Truth Calibration & Honest Counting (0 real Gemini calls)', () => {
  it('Mutasi 24: Script sentence "roda akan melaju lurus" (quote "would tend to continue") -> L2_HEDGE_DROPPED', () => {
    const ledger: FactLedger = {
      claims: [
        {
          id: 'C9',
          text: 'Tanpa bentuk kerucut, roda akan cenderung melaju lurus.',
          kind: 'fact',
          status: 'verified',
          sources: [
            {
              url: TRAIN_SOURCE.url,
              title: TRAIN_SOURCE.title,
              quote:
                'Without the conical shape, a wheel would tend to continue in a straight path due to the inertia of the rail vehicle, causing the wheelset to move towards the outer rail on the curve.',
              retrieved_at: TRAIN_SOURCE.retrieved_at,
            },
          ],
        },
      ],
    };
    const badScript: Script = {
      scenes: [
        {
          id: 'S2',
          sentences: [
            {
              text: 'Tanpa bentuk kerucut tersebut, roda akan melaju lurus karena kelembaman.',
              claim_refs: ['C9'],
              emphasis_words: [],
            },
          ],
        },
      ],
    };
    const l2 = verifyScriptL2(badScript, ledger);
    expect(l2.issues.some((i) => i.message.includes('L2_HEDGE_DROPPED'))).toBe(true);
  });

  it('Mutasi 25: Exact P4D C1 and C7 kereta are both verified (false-positive regression)', () => {
    const beforeLedgerPath = path.join(
      process.cwd(),
      'out',
      'review',
      'p4e',
      'p2-kereta',
      'before',
      'fact-ledger.json'
    );
    const beforeLedger = JSON.parse(readFileSync(beforeLedgerPath, 'utf-8')) as FactLedger;
    const c1 = beforeLedger.claims.find((c) => c.id === 'C1')!;
    const c7 = beforeLedger.claims.find((c) => c.id === 'C7')!;

    const res = verifyLedgerL1([c1, c7], [TRAIN_SOURCE], { C1: 'S1', C7: 'S1' });
    expect(res.ledger.claims.find((c) => c.id === 'C1')!.status).toBe('verified');
    expect(res.ledger.claims.find((c) => c.id === 'C7')!.status).toBe('verified');
    expect(res.report.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('Mutasi 26: Overstated compression claim repaired by A2 -> verified (and unverified gets status_reason)', async () => {
    const engineSrc: WikipediaSource = {
      source_id: 'S1',
      title: 'Four-stroke engine',
      lang: 'en',
      url: 'https://en.wikipedia.org/wiki/Four-stroke_engine',
      text: 'The piston compresses the air-fuel mixture in preparation for ignition during the compression stroke when both valves are closed.',
      retrieved_at: '2026-11-22T00:00:00.000Z',
    };
    const badClaim: FactClaim = {
      id: 'C3',
      text: 'Piston selalu memampatkan campuran udara-bahan bakar tanpa celah.',
      kind: 'fact',
      status: 'verified',
      sources: [
        {
          url: engineSrc.url,
          title: engineSrc.title,
          quote: engineSrc.text,
          retrieved_at: engineSrc.retrieved_at,
        },
      ],
    };
    const before = verifyLedgerL1([badClaim], [engineSrc], { C3: 'S1' });
    expect(before.ledger.claims[0]!.status).toBe('unverified');
    expect(before.ledger.claims[0]!.status_reason).toContain('L1_ABSOLUTE_ADDED');

    const fixedMap = await reparaphraseFailedClaims([before.ledger.claims[0]!], {
      generateJsonFn: (async () => ({
        data: {
          claims: [
            {
              id: 'C3',
              text: 'Piston memampatkan campuran udara dan bahan bakar untuk persiapan pengapian saat kedua katup tertutup.',
            },
          ],
        },
        rawText: '{}',
        model: 'mock',
        httpRetries: 0,
      })) as never,
    });
    const repairedClaim: FactClaim = { ...badClaim, text: fixedMap.get('C3')! };
    const after = verifyLedgerL1([repairedClaim], [engineSrc], { C3: 'S1' });
    expect(after.ledger.claims[0]!.status).toBe('verified');
  });

  it('Mutasi 27: Engine script missing compression step -> L0B_STEP_MISSING', () => {
    const ledger: FactLedger = {
      claims: [
        {
          id: 'C1',
          text: 'Langkah hisap menarik campuran udara.',
          kind: 'fact',
          status: 'verified',
          sources: [{ url: TRAIN_SOURCE.url, title: 'Engine', quote: 'Intake draws mixture.', retrieved_at: '2026-11-22T00:00:00.000Z' }],
        },
      ],
    };
    const script: Script = {
      scenes: [
        { id: 'S2', sentences: [{ text: 'Langkah hisap menarik udara.', claim_refs: ['C1'], emphasis_words: [] }] },
        { id: 'S3', sentences: [{ text: 'Langkah usaha mendorong piston.', claim_refs: ['C1'], emphasis_words: [] }] },
        { id: 'S4', sentences: [{ text: 'Langkah buang mengeluarkan gas.', claim_refs: ['C1'], emphasis_words: [] }] },
      ],
    };
    const cov = checkKeyStepsCoverage(['Hisap', 'Kompresi', 'Usaha', 'Buang'], script, ledger);
    expect(cov.issues.some((i) => i.message.includes('L0B_STEP_MISSING') && i.ref === 'Kompresi')).toBe(true);
  });

  it('Mutasi 28: MotionArrow pointing up while piston moves down -> VIS_ARROW_DIRECTION_MISMATCH', () => {
    const issues = checkMechanicsFromTelemetry(
      [
        {
          frame: 0,
          sec: 0,
          drivers: { crank_angle: { value: 360, unit: '°' } },
          entities: [
            { id: 'piston_crank', role: 'focus', bbox: { x: 200, y: 300, width: 150, height: 250 }, partStates: { piston_y: 0.9 } },
            { id: 'power_arrow', role: 'prop', bbox: { x: 250, y: 320, width: 40, height: 80 }, partStates: { arrow_dir_y: 1.0, bind_to_part: 'piston' } },
          ],
          hud: [],
        },
        {
          frame: 30,
          sec: 1,
          drivers: { crank_angle: { value: 540, unit: '°' } },
          entities: [
            { id: 'piston_crank', role: 'focus', bbox: { x: 200, y: 300, width: 150, height: 250 }, partStates: { piston_y: 0.3 } },
            { id: 'power_arrow', role: 'prop', bbox: { x: 250, y: 320, width: 40, height: 80 }, partStates: { arrow_dir_y: 1.0, bind_to_part: 'piston' } },
          ],
          hud: [],
        },
      ],
      { compositionId: 'mut28', focusEntities: ['piston_crank'], invariants: [], expectedHud: [] }
    );
    expect(issues.some((i) => i.message.includes('VIS_ARROW_DIRECTION_MISMATCH'))).toBe(true);
  });

  it('Mutasi 29 & A7: "Tegelincir" in KineticTitle -> TEXT_UNKNOWN_WORD; EffectiveDiameterCompare display="value" -> L5_HUD_DISPLAY_MISMATCH', () => {
    const sb: Storyboard = {
      scenes: [
        {
          id: 'S1',
          lane: 'code_3d',
          shot_type: 'comparison',
          camera_move: 'dolly',
          duration_sec: 5,
          sentence_refs: ['S1.1'],
          focus_entities: ['wheelset'],
          visible_parts: ['wheel_left', 'wheel_right'],
          hud: [
            {
              hud_id: 'S1_H1',
              component: 'KineticTitle',
              props: { title: 'Kenapa Kereta Tidak Tegelincir?' },
              illustrative: true,
            },
            {
              hud_id: 'S1_H2',
              component: 'EffectiveDiameterCompare',
              props: { outerLabel: 'Luar', innerLabel: 'Dalam' },
              bind_to_driver: true,
              quantity: 'effective_diameter',
              display: 'value',
              claim_ref: 'C1',
            },
          ],
          trigger_words: ['kereta'],
        },
      ],
    };
    const spellIssues = checkHudSpelling(sb, { topic: 'Kenapa kereta tidak tergelincir?' });
    expect(spellIssues.some((i) => i.severity === 'error' && i.message.includes('TEXT_UNKNOWN_WORD'))).toBe(true);

    const codeIssues = verifyStoryboardCode(
      sb,
      { scenes: [{ id: 'S1', sentences: [{ text: 'Kereta.', claim_refs: ['C1'], emphasis_words: [] }] }] },
      { total_sec: 5, scenes: [{ scene_id: 'S1', start: 0, end: 5, audio_path: 'a.wav' }], events: [], beats: [], shots: [], words: [] },
      { claims: [{ id: 'C1', text: 'Roda kereta.', kind: 'fact', status: 'verified', sources: [{ url: TRAIN_SOURCE.url, title: 'x', quote: 'Wheelset.', retrieved_at: '2026-11-22T00:00:00.000Z' }] }] }
    ).issues;
    expect(codeIssues.some((i) => i.message.includes('L5_HUD_DISPLAY_MISMATCH'))).toBe(true);
  });

  it('Mutasi 30: publish.md dropping hedge -> L2_HEDGE_DROPPED', () => {
    const ledger: FactLedger = {
      claims: [
        {
          id: 'C9',
          text: 'Tanpa bentuk kerucut, roda akan cenderung melaju lurus.',
          kind: 'fact',
          status: 'verified',
          sources: [
            {
              url: TRAIN_SOURCE.url,
              title: TRAIN_SOURCE.title,
              quote: 'Without the conical shape, a wheel would tend to continue in a straight path.',
              retrieved_at: TRAIN_SOURCE.retrieved_at,
            },
          ],
        },
      ],
    };
    const pubMd = `# Publish\n\n## Deskripsi\nTanpa bentuk kerucut, roda akan melaju lurus.\n\n## Daftar Sumber\n- ${TRAIN_SOURCE.url}\n`;
    const res = validatePublishHedges(pubMd, ledger);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('L2_HEDGE_DROPPED'))).toBe(true);
  });

  it('Mutasi 31 + B2: 3 consecutive runs without changes -> run 2 and run 3 make 0 LLM calls; phase stats filter works', async () => {
    const tmpRoot = path.join(tmpdir(), `mgs-p4e-test-${Date.now()}`);
    const projId = 'test-b3';
    const projDir = path.join(tmpRoot, 'projects', projId);
    mkdirSync(path.join(projDir, 'qc'), { recursive: true });
    mkdirSync(path.join(tmpRoot, 'remotion', 'src', 'kit'), { recursive: true });
    writeFileSync(path.join(tmpRoot, 'remotion', 'src', 'kit', 'KIT-API.md'), '# Kit', 'utf-8');

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
        stages: { S1: 'done', S2: 'done', S3: 'done', S4: 'done', S5: 'done', S6: 'pending', S7: 'pending', S8: 'pending', S9: 'pending', S10: 'pending', S11: 'pending', S12: 'pending' },
        created_at: '2026-11-22T00:00:00.000Z',
        updated_at: '2026-11-22T00:00:00.000Z',
      }),
      'utf-8'
    );
    writeFileSync(
      path.join(projDir, 'fact-ledger.json'),
      JSON.stringify({
        claims: [
          {
            id: 'C1',
            text: 'Sebagian besar roda kereta berbentuk kerucut.',
            kind: 'fact',
            status: 'verified',
            sources: [{ url: TRAIN_SOURCE.url, title: 'Wheelset', quote: 'Most train wheels have a conical taper.', retrieved_at: '2026-11-22T00:00:00.000Z' }],
          },
        ],
      }),
      'utf-8'
    );
    writeFileSync(
      path.join(projDir, 'script.json'),
      JSON.stringify({
        scenes: [{ id: 'S1', sentences: [{ text: 'Sebagian besar roda kereta kerucut.', claim_refs: ['C1'], emphasis_words: [] }] }],
      }),
      'utf-8'
    );
    writeFileSync(
      path.join(projDir, 'timeline.json'),
      JSON.stringify({ total_sec: 5, scenes: [{ scene_id: 'S1', start: 0, end: 5, audio_path: 'a.wav' }], events: [], beats: [], shots: [], words: [] }),
      'utf-8'
    );

    const sbSample: Storyboard = {
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
          hud: [{ hud_id: 'S1_H1', component: 'Callout', props: { label: 'Roda kerucut' }, claim_ref: 'C1' }],
          trigger_words: ['kerucut'],
        },
      ],
    };

    let runCalls = 0;
    const mockGen = async (_schema: unknown, _prompt: string, opts: { purpose?: string }) => {
      runCalls++;
      if (opts.purpose === 'storyboard') {
        return { data: sbSample, rawText: '{}', model: 'mock', httpRetries: 0 };
      }
      if (opts.purpose === 'l5_semantic') {
        return { data: { items: [{ hud_id: 'S1_H1', verdict: 'OK', reason: 'ok' }] }, rawText: '{}', model: 'mock', httpRetries: 0 };
      }
      return { data: { consistent: true, issues: [] }, rawText: '{}', model: 'mock', httpRetries: 0 };
    };

    // Run 1
    runCalls = 0;
    await runStoryboardStage(projId, tmpRoot, { generateJsonFn: mockGen as never });
    await runStoryboardQcStage(projId, tmpRoot, { generateJsonFn: mockGen as never });
    expect(runCalls).toBe(3); // 1 storyboard + 1 storyboard_review + 1 l5_semantic

    // Run 2 (no changes) -> 0 calls
    runCalls = 0;
    await runStoryboardStage(projId, tmpRoot, { generateJsonFn: mockGen as never });
    await runStoryboardQcStage(projId, tmpRoot, { generateJsonFn: mockGen as never });
    expect(runCalls).toBe(0);

    // Run 3 (no changes) -> 0 calls
    runCalls = 0;
    await runStoryboardStage(projId, tmpRoot, { generateJsonFn: mockGen as never });
    await runStoryboardQcStage(projId, tmpRoot, { generateJsonFn: mockGen as never });
    expect(runCalls).toBe(0);

    // Test B2 phase filter on llm-calls.jsonl
    writeFileSync(
      path.join(projDir, 'llm-calls.jsonl'),
      [
        JSON.stringify({ ts: '2026-11-22T01:00:00.000Z', run_id: 'old', stage: 'S6', purpose: 'storyboard', scene_id: null, attempt: 1, http_retries: 0, ok: true }),
        JSON.stringify({ ts: '2026-11-22T10:30:00.000Z', run_id: 'new', stage: 'S2', purpose: 'extract', scene_id: null, attempt: 1, http_retries: 0, ok: true }),
      ].join('\n'),
      'utf-8'
    );
    const phaseStats = await aggregateLlmCallStats(projDir, '2026-11-22T10:00:00.000Z');
    expect(phaseStats.totalCalls).toBe(1);
    const allStats = await aggregateLlmCallStats(projDir);
    expect(allStats.totalCalls).toBe(2);

    rmSync(tmpRoot, { recursive: true, force: true });
  });
});
