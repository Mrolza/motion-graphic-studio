import { describe, expect, it } from 'vitest';
import type { FactClaim, FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import type { WikipediaSource } from '@core/research/wikipedia';
import { evaluateL0, verifyLedgerL1 } from '@core/qc/l1-ledger';
import { verifyScriptL2 } from '@core/qc/l2-script';

const sampleSources: WikipediaSource[] = [
  {
    source_id: 'S1',
    url: 'https://en.wikipedia.org/wiki/Standard-gauge_railway',
    title: 'Standard-gauge railway',
    lang: 'en',
    text: 'Standard gauge is 1,435 mm (4 ft 8 1/2 in) — also known as Stephenson gauge.',
    retrieved_at: '2026-11-18T00:00:00.000Z',
  },
];

function makeClaim(overrides: Partial<FactClaim> = {}): FactClaim {
  return {
    id: 'C1',
    text: 'Lebar sepur standar adalah 1.435 mm.',
    value: 1435,
    unit: 'mm',
    kind: 'fact',
    status: 'unverified',
    sources: [
      {
        url: sampleSources[0]!.url,
        title: sampleSources[0]!.title,
        quote: 'Standard gauge is 1,435 mm (4 ft 8 1/2 in) - also known as Stephenson gauge.',
        retrieved_at: '2026-11-18T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('QC L1 & L0 (offline fixtures)', () => {
  it('L1 rejects paraphrased quote and accepts quote differing only in whitespace/quotes/dashes', () => {
    const valid = verifyLedgerL1(
      [
        makeClaim({
          sources: [
            {
              url: sampleSources[0]!.url,
              title: sampleSources[0]!.title,
              quote: 'Standard   gauge is 1,435 mm (4 ft 8 1/2 in) -  also known as Stephenson gauge.',
              retrieved_at: '2026-11-18T00:00:00.000Z',
            },
          ],
        }),
      ],
      sampleSources,
      { C1: 'S1' }
    );
    expect(valid.ledger.claims[0]!.status).toBe('verified');
    expect(valid.report.issues).toHaveLength(0);

    const paraphrased = verifyLedgerL1(
      [
        makeClaim({
          sources: [
            {
              url: sampleSources[0]!.url,
              title: sampleSources[0]!.title,
              quote: 'The standard railway track width is 1,435 mm.',
              retrieved_at: '2026-11-18T00:00:00.000Z',
            },
          ],
        }),
      ],
      sampleSources,
      { C1: 'S1' }
    );
    expect(paraphrased.ledger.claims[0]!.status).toBe('unverified');
    expect(paraphrased.report.issues[0]?.message).toContain('QUOTE_NOT_IN_SOURCE');
  });

  it('L1 rejects value missing from quote and accepts 1,435 (en) for value=1435', () => {
    const ok = verifyLedgerL1([makeClaim({ value: 1435 })], sampleSources, { C1: 'S1' });
    expect(ok.ledger.claims[0]!.status).toBe('verified');

    const badVal = verifyLedgerL1([makeClaim({ value: 1500 })], sampleSources, { C1: 'S1' });
    expect(badVal.ledger.claims[0]!.status).toBe('unverified');
    expect(badVal.report.issues[0]?.message).toContain('VALUE_NOT_IN_QUOTE');
  });

  it('L0 marks concept_unverifiable when a core claim lacks verified support', () => {
    const verified = [makeClaim({ status: 'verified' })];
    const l0 = evaluateL0(
      ['Lebar rel standar adalah 1435 mm', 'Kecepatan kereta maglev mencapai 600 km/jam'],
      verified
    );
    expect(l0.passed).toBe(false);
    expect(l0.report.issues[0]?.message).toContain('concept_unverifiable');
  });
});

describe('QC L2 (offline fixtures)', () => {
  const ledger: FactLedger = {
    claims: [
      makeClaim({ id: 'C1', status: 'verified' }),
      makeClaim({ id: 'C2', status: 'unverified', value: 200 }),
    ],
  };

  it('catches fabricated number, unsourced number, unverified claim_ref, and non_factual with year', () => {
    const badScript: Script = {
      scenes: [
        {
          id: 'S1',
          sentences: [
            {
              text: 'Sejak tahun 1825 kereta mengubah dunia.',
              claim_refs: [],
              emphasis_words: ['1825'],
              non_factual: true,
            },
            {
              text: 'Lebar rel standar adalah 1.500 mm.',
              claim_refs: ['C1'],
              emphasis_words: ['1.500'],
            },
            {
              text: 'Kereta melaju hingga 300 km/jam.',
              claim_refs: [],
              emphasis_words: ['300'],
            },
            {
              text: 'Batasnya adalah 200 meter.',
              claim_refs: ['C2'],
              emphasis_words: ['200'],
            },
          ],
        },
      ],
    };

    const report = verifyScriptL2(badScript, ledger);
    const msgs = report.issues.map((i) => i.message);
    expect(msgs.some((m) => m.includes('NON_FACTUAL_HAS_FACT'))).toBe(true);
    expect(msgs.some((m) => m.includes('NUMBER_NOT_IN_CLAIM'))).toBe(true);
    expect(msgs.some((m) => m.includes('UNSOURCED_FACT'))).toBe(true);
    expect(msgs.some((m) => m.includes('BAD_CLAIM_REF'))).toBe(true);
  });

  it('passes valid script referencing verified claim with id-ID 1.435 format', () => {
    const goodScript: Script = {
      scenes: [
        {
          id: 'S1',
          sentences: [
            {
              text: 'Kenapa kereta tetap stabil di jalurnya?',
              claim_refs: [],
              emphasis_words: ['kereta'],
              non_factual: true,
            },
            {
              text: 'Kuncinya ada pada lebar rel standar 1.435 mm.',
              claim_refs: ['C1'],
              emphasis_words: ['1.435'],
            },
          ],
        },
      ],
    };
    const report = verifyScriptL2(goodScript, ledger);
    expect(report.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });
});
