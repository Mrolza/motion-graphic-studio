import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FactClaim } from '@core/contracts/fact-ledger';
import type { WikipediaSource } from '@core/research/wikipedia';
import { validateGate1Approval } from '@core/qc/gate1-check';
import { CombinedVerifierOutputSchema } from '@core/qc/l0b-quality';
import { evaluateL0, verifyLedgerL1 } from '@core/qc/l1-ledger';
import {
  createProject,
  incrementProjectLlmCalls,
  resetProjectLastRunCalls,
} from '@core/project/store';

describe('P2C Gate 1 Blocking Rules, L0 Strict Core Claims, and L1 Claim-Quote Support', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const d of tempDirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function setupProjectDir(overrides: {
    l0Issues?: unknown[];
    l0b?: Record<string, unknown>;
    l1Issues?: unknown[];
    l2Issues?: unknown[];
    l3Issues?: unknown[];
    claimStatus?: 'verified' | 'unverified';
  }): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'mgs-gate1-'));
    tempDirs.push(dir);
    mkdirSync(path.join(dir, 'qc'), { recursive: true });

    writeFileSync(
      path.join(dir, 'fact-ledger.json'),
      JSON.stringify({
        claims: [
          {
            id: 'C1',
            text: 'Apollo 11 mendarat pada 20 Juli 1969.',
            kind: 'fact',
            status: overrides.claimStatus ?? 'verified',
            sources: [
              {
                url: 'https://en.wikipedia.org/wiki/Apollo_11',
                title: 'Apollo 11',
                quote: 'Apollo 11 landed on the Moon on July 20, 1969.',
                retrieved_at: '2026-11-20T00:00:00.000Z',
              },
            ],
          },
          {
            id: 'C2',
            text: 'Klaim dibuang.',
            kind: 'fact',
            status: 'unverified',
            sources: [
              {
                url: 'https://en.wikipedia.org/wiki/Apollo_11',
                title: 'Apollo 11',
                quote: 'Unused fragment.',
                retrieved_at: '2026-11-20T00:00:00.000Z',
              },
            ],
          },
        ],
      })
    );
    writeFileSync(
      path.join(dir, 'script.json'),
      JSON.stringify({
        scenes: [
          {
            id: 'S1',
            sentences: [{ text: 'Pada 20 Juli 1969, Apollo 11 mendarat di Bulan.', claim_refs: ['C1'], emphasis_words: ['1969'] }],
          },
        ],
      })
    );
    writeFileSync(path.join(dir, 'qc', 'L0.json'), JSON.stringify({ layer: 'L0', issues: overrides.l0Issues ?? [] }));
    writeFileSync(
      path.join(dir, 'qc', 'L0b.json'),
      JSON.stringify(overrides.l0b ?? { layer: 'L0b', answers_question: true, issues: [] })
    );
    writeFileSync(
      path.join(dir, 'qc', 'L1.json'),
      JSON.stringify({
        layer: 'L1',
        issues: overrides.l1Issues ?? [{ severity: 'error', message: 'QUOTE_NOT_IN_SOURCE', ref: 'C2' }],
      })
    );
    writeFileSync(path.join(dir, 'qc', 'L2.json'), JSON.stringify({ layer: 'L2', issues: overrides.l2Issues ?? [] }));
    writeFileSync(path.join(dir, 'qc', 'L3.json'), JSON.stringify({ layer: 'L3', issues: overrides.l3Issues ?? [] }));
    return dir;
  }

  it('approves clean Gate 1 and downgrades unused L1 error to info', async () => {
    const dir = setupProjectDir({});
    const res = await validateGate1Approval(dir);
    expect(res.approved).toBe(true);
    expect(res.reasons).toEqual([]);
    expect(res.l1Updated.issues[0]?.severity).toBe('info');
    expect(res.l1Updated.issues[0]?.message).toContain('klaim dibuang:');
  });

  it('rejects Gate 1 on any error in L0, L0b, L2, L3, answers_question=false, or unverified ref', async () => {
    expect((await validateGate1Approval(setupProjectDir({ l0Issues: [{ severity: 'error', message: 'err', ref: 'c1' }] }))).approved).toBe(false);
    expect((await validateGate1Approval(setupProjectDir({ l0b: { layer: 'L0b', answers_question: false, issues: [] } }))).approved).toBe(false);
    expect((await validateGate1Approval(setupProjectDir({ l0b: { layer: 'L0b', answers_question: true, issues: [{ severity: 'error', message: 'low coverage', ref: 'script' }] } }))).approved).toBe(false);
    expect((await validateGate1Approval(setupProjectDir({ l2Issues: [{ severity: 'error', message: 'num', ref: 'S1.1' }] }))).approved).toBe(false);
    expect((await validateGate1Approval(setupProjectDir({ l3Issues: [{ severity: 'error', message: 'overstated', ref: 'S1.1' }] }))).approved).toBe(false);
    expect((await validateGate1Approval(setupProjectDir({ claimStatus: 'unverified' }))).approved).toBe(false);
  });

  it('L0 strictly checks mapped core_claims and flags unsupported history core claims', () => {
    const verified: FactClaim[] = [
      {
        id: 'C1',
        text: 'Misi Soyuz MS-13 diluncurkan 20 Juli 2019.',
        kind: 'fact',
        status: 'verified',
        sources: [{ url: 'https://en.wikipedia.org/wiki/Soyuz_MS-13', title: 'Soyuz', quote: 'Soyuz MS-13 launched on 20 July 2019.', retrieved_at: '2026-11-20T00:00:00.000Z' }],
      },
    ];
    const l0 = evaluateL0(
      ['Apollo 11 mendarat 20 Juli 1969', 'Modul Eagle membawa Armstrong dan Aldrin'],
      verified,
      { 0: [], 1: [] }
    );
    expect(l0.passed).toBe(false);
    expect(l0.report.issues).toHaveLength(2);
    expect(l0.report.issues[0]?.message).toContain('concept_unverifiable');
  });

  it('L1 rejects QUOTE_FRAGMENT and CLAIM_FACT_NOT_IN_QUOTE, and accepts complete sentence with July 20 <-> 20 Juli', () => {
    const sources: WikipediaSource[] = [
      {
        source_id: 'S1',
        url: 'https://en.wikipedia.org/wiki/Apollo_11',
        title: 'Apollo 11',
        lang: 'en',
        text: 'Apollo 11 landed on the Moon on July 20, 1969. It marked the 50th anniversary of the first Moon landing later.',
        retrieved_at: '2026-11-20T00:00:00.000Z',
      },
    ];

    const fragmentRes = verifyLedgerL1(
      [
        {
          id: 'C1',
          text: 'Tanggal 20 Juli dikaitkan dengan pendaratan di Bulan.',
          kind: 'fact',
          status: 'unverified',
          sources: [{ url: sources[0]!.url, title: 'Apollo 11', quote: 'the 50th anniversary of the first Moon landing', retrieved_at: '2026-11-20T00:00:00.000Z' }],
        },
      ],
      sources,
      { C1: 'S1' }
    );
    expect(fragmentRes.ledger.claims[0]!.status).toBe('unverified');
    expect(fragmentRes.report.issues[0]?.message).toContain('QUOTE_FRAGMENT');

    const missingDateRes = verifyLedgerL1(
      [
        {
          id: 'C2',
          text: 'Pendaratan Apollo 11 terjadi pada 20 Juli 1969.',
          kind: 'fact',
          status: 'unverified',
          sources: [{ url: sources[0]!.url, title: 'Apollo 11', quote: 'It marked the 50th anniversary of the first Moon landing later.', retrieved_at: '2026-11-20T00:00:00.000Z' }],
        },
      ],
      sources,
      { C2: 'S1' }
    );
    expect(missingDateRes.ledger.claims[0]!.status).toBe('unverified');
    expect(missingDateRes.report.issues[0]?.message).toContain('CLAIM_FACT_NOT_IN_QUOTE');

    const okRes = verifyLedgerL1(
      [
        {
          id: 'C3',
          text: 'Pendaratan Apollo 11 terjadi pada 20 Juli 1969.',
          kind: 'fact',
          status: 'unverified',
          sources: [{ url: sources[0]!.url, title: 'Apollo 11', quote: 'Apollo 11 landed on the Moon on July 20, 1969.', retrieved_at: '2026-11-20T00:00:00.000Z' }],
        },
      ],
      sources,
      { C3: 'S1' }
    );
    expect(okRes.ledger.claims[0]!.status).toBe('verified');
    expect(okRes.report.issues).toHaveLength(0);
  });

  it('L1 rejects CLAIM_NAME_NOT_IN_QUOTE when proper names in claim text are absent from quote', () => {
    const sources: WikipediaSource[] = [
      {
        source_id: 'S1',
        url: 'https://en.wikipedia.org/wiki/Apollo_11',
        title: 'Apollo 11',
        lang: 'en',
        text: 'Apollo 11 was the American spaceflight that first landed humans on the Moon. Commander Neil Armstrong and lunar module pilot Buzz Aldrin landed the Apollo Lunar Module Eagle on July 20, 1969.',
        retrieved_at: '2026-11-20T00:00:00.000Z',
      },
    ];

    const missingNameRes = verifyLedgerL1(
      [
        {
          id: 'C1',
          text: 'Neil Armstrong dan Buzz Aldrin menjadi manusia pertama yang menginjakkan kaki di Bulan.',
          kind: 'fact',
          status: 'unverified',
          sources: [
            {
              url: sources[0]!.url,
              title: 'Apollo 11',
              quote: 'Apollo 11 was the American spaceflight that first landed humans on the Moon.',
              retrieved_at: '2026-11-20T00:00:00.000Z',
            },
          ],
        },
      ],
      sources,
      { C1: 'S1' }
    );
    expect(missingNameRes.ledger.claims[0]!.status).toBe('unverified');
    expect(missingNameRes.report.issues[0]?.message).toContain('CLAIM_NAME_NOT_IN_QUOTE');

    const okNameRes = verifyLedgerL1(
      [
        {
          id: 'C2',
          text: 'Komandan Neil Armstrong dan Buzz Aldrin mendaratkan Eagle pada 20 Juli 1969.',
          kind: 'fact',
          status: 'unverified',
          sources: [
            {
              url: sources[0]!.url,
              title: 'Apollo 11',
              quote:
                'Commander Neil Armstrong and lunar module pilot Buzz Aldrin landed the Apollo Lunar Module Eagle on July 20, 1969.',
              retrieved_at: '2026-11-20T00:00:00.000Z',
            },
          ],
        },
      ],
      sources,
      { C2: 'S1' }
    );
    expect(okNameRes.ledger.claims[0]!.status).toBe('verified');
  });

  it('tracks llm_calls_last_run separately from cumulative llm_calls and validates L0b hook_paid/main_event_named', async () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'mgs-calls-'));
    tempDirs.push(repoRoot);
    await createProject({ id: 'demo-calls', topic: 'Test', format: 'today_in_history', style: 'map_archive' }, repoRoot);
    await incrementProjectLlmCalls('demo-calls', 'S3', 2, repoRoot);
    await incrementProjectLlmCalls('demo-calls', 'S4', 1, repoRoot);
    const resetProj = await resetProjectLastRunCalls('demo-calls', undefined, repoRoot);
    expect(resetProj.llm_calls.S3).toBe(2);
    expect(resetProj.llm_calls_last_run?.S3).toBe(0);
    const afterProj = await incrementProjectLlmCalls('demo-calls', 'S4', 1, repoRoot);
    expect(afterProj.llm_calls.S4).toBe(2);
    expect(afterProj.llm_calls_last_run?.S4).toBe(1);

    const parsed = CombinedVerifierOutputSchema.parse({
      l0b: {
        answers_question: true,
        has_off_topic_scene: false,
        hook_paid: false,
        main_event_dated: true,
        main_event_named: false,
        scores: { answers_direct: 5, coverage: 5, structure: 5, on_topic: 5 },
        issues: [],
      },
      l3: { evaluations: [] },
    });
    expect(parsed.l0b.hook_paid).toBe(false);
    expect(parsed.l0b.main_event_named).toBe(false);
  });
});
