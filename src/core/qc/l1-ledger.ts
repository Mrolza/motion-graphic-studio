import type { FactClaim, FactLedger } from '@core/contracts/fact-ledger';
import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import type { WikipediaSource } from '@core/research/wikipedia';

const MONTH_PAIRS: Array<[string, string]> = [
  ['januari', 'january'],
  ['februari', 'february'],
  ['maret', 'march'],
  ['april', 'april'],
  ['mei', 'may'],
  ['juni', 'june'],
  ['juli', 'july'],
  ['agustus', 'august'],
  ['september', 'september'],
  ['oktober', 'october'],
  ['november', 'november'],
  ['desember', 'december'],
];

export function normalizeTextForMatch(input: string): string {
  return input
    .replace(/[\u00A0\u200B\u2009]/g, ' ')
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractNumericValuesFromText(text: string): number[] {
  const matches = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  const values: number[] = [];

  for (const raw of matches) {
    if (/^\d{1,3}(?:,\d{3})+$/.test(raw)) {
      values.push(Number(raw.replace(/,/g, '')));
    } else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
      values.push(Number(raw.replace(/\./g, '')));
    } else if (/^\d+,\d+$/.test(raw)) {
      values.push(Number(raw.replace(',', '.')));
    } else {
      const n = Number(raw);
      if (Number.isFinite(n)) values.push(n);
    }
  }
  return values;
}

export function doesValueAppearInQuote(value: number, quote: string): boolean {
  const nums = extractNumericValuesFromText(quote);
  return nums.some((n) => Math.abs(n - value) < 1e-6);
}

export function isCompleteSentenceQuote(normQuote: string, normSource: string): boolean {
  if (!normQuote) return false;
  const startsUpperOrDigit = /^[A-Z0-9"'(]/.test(normQuote);
  const endsWithPunct = /[.!?]["')]*$/.test(normQuote);
  if (!startsUpperOrDigit || !endsWithPunct) return false;

  const idx = normSource.indexOf(normQuote);
  if (idx === -1) return false;
  if (idx === 0) return true;
  // Must start at a sentence/section/line boundary in source (after ., !, ?, :, =, or opening quote)
  const before = normSource.slice(Math.max(0, idx - 3), idx);
  return /[.!?:=]\s+$/.test(before) || /^[\s"'(]+$/.test(before);
}

export function doClaimFactsAppearInQuote(claimText: string, quote: string): boolean {
  const claimNums = extractNumericValuesFromText(claimText);
  const quoteNums = extractNumericValuesFromText(quote);
  for (const n of claimNums) {
    if (!quoteNums.some((qn) => Math.abs(qn - n) < 1e-6)) {
      return false;
    }
  }

  const lowerClaim = claimText.toLowerCase();
  const lowerQuote = quote.toLowerCase();
  for (const [idMonth, enMonth] of MONTH_PAIRS) {
    if (new RegExp(`\\b${idMonth}\\b`).test(lowerClaim)) {
      const hasMonth =
        new RegExp(`\\b${idMonth}\\b`).test(lowerQuote) ||
        new RegExp(`\\b${enMonth}\\b`).test(lowerQuote);
      if (!hasMonth) return false;
    }
  }
  return true;
}

const NAME_EQUIVALENTS: Record<string, string[]> = {
  bulan: ['moon', 'lunar'],
  bumi: ['earth'],
  matahari: ['sun', 'solar'],
  jerman: ['german', 'germany'],
  inggris: ['english', 'england', 'british'],
  amerika: ['american', 'america', 'united states', 'u.s.'],
  prusia: ['prussia', 'prussian'],
  operasi: ['operation'],
  tranquillity: ['tranquility'],
  pasifik: ['pacific'],
  atlantik: ['atlantic'],
  soviet: ['soviet', 'ussr'],
};

const NON_PROPER_CAPITAL_WORDS = new Set([
  ...MONTH_PAIRS.map(([id]) => id),
  'base',
  'modul',
  'misi',
  'tahun',
  'tanggal',
  'pukul',
  'serikat',
  'uni',
  'utara',
  'selatan',
  'timur',
  'barat',
  'perang',
  'dunia',
  'luar',
  'angkasa',
  'planet',
  'komando',
  'program',
  'pusat',
  'stasiun',
  'kolonel',
  'jenderal',
  'presiden',
  'kanselir',
  'komandan',
  'pilot',
  'astronot',
  'antariksawan',
]);

export function doClaimNamesAppearInQuote(claimText: string, quote: string): string[] {
  const rawWords = claimText.split(/\s+/).filter(Boolean);
  const lowerQuote = quote.toLowerCase();
  const missing: string[] = [];

  for (let i = 1; i < rawWords.length; i++) {
    const raw = rawWords[i]!;
    // Skip words that open a quoted phrase (e.g. 'Satu langkah kecil...)
    if (/^["""'(]/.test(raw)) continue;
    const w = raw.replace(/^["""'(]+|[.,!?;:"""')]+$/g, '');
    if (!/^[A-Z][a-z]{2,}$/.test(w)) continue;
    const prev = rawWords[i - 1] ?? '';
    if (/[.!?]$/.test(prev)) continue;

    const lower = w.toLowerCase();
    if (NON_PROPER_CAPITAL_WORDS.has(lower)) continue;

    const candidates = [lower, ...(NAME_EQUIVALENTS[lower] ?? [])];
    if (!candidates.some((c) => lowerQuote.includes(c))) {
      missing.push(w);
    }
  }
  return missing;
}

export interface L1Result {
  ledger: FactLedger;
  report: QcReport;
}

export function verifyLedgerL1(
  claims: FactClaim[],
  sources: WikipediaSource[],
  claimSourceIds?: Record<string, string>
): L1Result {
  const sourceByUrl = new Map(sources.map((s) => [s.url, s]));
  const sourceById = new Map(sources.map((s) => [s.source_id, s]));
  const normalizedTexts = new Map(
    sources.map((s) => [s.source_id, normalizeTextForMatch(s.text)])
  );

  const issues: QcIssue[] = [];
  const verifiedClaims: FactClaim[] = claims.map((claim) => {
    const primarySrc = claim.sources[0];
    const sid = claimSourceIds?.[claim.id];
    const matchedSource =
      (sid ? sourceById.get(sid) : undefined) ??
      (primarySrc ? sourceByUrl.get(primarySrc.url) : undefined);

    if (!matchedSource || !primarySrc) {
      issues.push({
        severity: 'error',
        message: 'SOURCE_NOT_FOUND: sumber klaim tidak ditemukan di berkas sumber tersimpan',
        ref: claim.id,
      });
      return { ...claim, status: 'unverified' };
    }

    const normSource = normalizedTexts.get(matchedSource.source_id) ?? '';
    const normQuote = normalizeTextForMatch(primarySrc.quote);

    if (!normQuote || !normSource.includes(normQuote)) {
      issues.push({
        severity: 'error',
        message: 'QUOTE_NOT_IN_SOURCE: kutipan tidak ditemukan apa adanya di teks sumber',
        ref: claim.id,
      });
      return { ...claim, status: 'unverified' };
    }

    if (!isCompleteSentenceQuote(normQuote, normSource)) {
      issues.push({
        severity: 'error',
        message: 'QUOTE_FRAGMENT: kutipan harus berupa kalimat utuh dari sumber, bukan potongan frasa',
        ref: claim.id,
      });
      return { ...claim, status: 'unverified' };
    }

    if (claim.value !== undefined && !doesValueAppearInQuote(claim.value, primarySrc.quote)) {
      issues.push({
        severity: 'error',
        message: `VALUE_NOT_IN_QUOTE: angka ${claim.value} tidak ditemukan pada kutipan`,
        ref: claim.id,
      });
      return { ...claim, status: 'unverified' };
    }

    if (!doClaimFactsAppearInQuote(claim.text, primarySrc.quote)) {
      issues.push({
        severity: 'error',
        message: 'CLAIM_FACT_NOT_IN_QUOTE: angka/tahun/tanggal pada teks klaim tidak muncul di kutipan',
        ref: claim.id,
      });
      return { ...claim, status: 'unverified' };
    }

    const missingNames = doClaimNamesAppearInQuote(claim.text, primarySrc.quote);
    if (missingNames.length > 0) {
      issues.push({
        severity: 'error',
        message: `CLAIM_NAME_NOT_IN_QUOTE: nama diri (${missingNames.join(', ')}) pada teks klaim tidak muncul di kutipan`,
        ref: claim.id,
      });
      return { ...claim, status: 'unverified' };
    }

    return {
      ...claim,
      status: 'verified',
      sources: claim.sources.map((s, idx) =>
        idx === 0 ? { ...s, url: matchedSource.url, title: matchedSource.title } : s
      ),
    };
  });

  return {
    ledger: { claims: verifiedClaims },
    report: { layer: 'L1', issues },
  };
}

function tokenizeKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

export function evaluateL0(
  coreClaims: string[],
  verifiedClaims: FactClaim[],
  coreClaimMapping?: Record<number, string[]>
): { passed: boolean; report: QcReport } {
  const issues: QcIssue[] = [];
  const verifiedSet = new Set(verifiedClaims.filter((c) => c.status === 'verified').map((c) => c.id));

  for (let i = 0; i < coreClaims.length; i++) {
    const core = coreClaims[i]!;
    if (coreClaimMapping) {
      const mappedIds = (coreClaimMapping[i] ?? []).filter((id) => verifiedSet.has(id));
      if (mappedIds.length === 0) {
        issues.push({
          severity: 'error',
          message: `concept_unverifiable: core claim #${i + 1} ("${core.slice(0, 80)}") tidak didukung klaim verified`,
          ref: `core_claim_${i + 1}`,
        });
      }
      continue;
    }

    const coreTokens = new Set(tokenizeKeywords(core));
    const coreNums = extractNumericValuesFromText(core);
    const hasMatch = verifiedClaims.some((vc) => {
      if (vc.status !== 'verified') return false;
      const vNums = vc.value !== undefined ? [vc.value] : extractNumericValuesFromText(vc.text);
      if (coreNums.length > 0 && coreNums.some((cn) => vNums.includes(cn))) return true;
      const vTokens = tokenizeKeywords(`${vc.text} ${vc.sources[0]?.quote ?? ''}`);
      const overlap = vTokens.filter((t) => coreTokens.has(t)).length;
      return overlap >= 2;
    });

    if (!hasMatch) {
      issues.push({
        severity: 'error',
        message: `concept_unverifiable: core claim #${i + 1} ("${core.slice(0, 80)}") tidak didukung klaim verified`,
        ref: `core_claim_${i + 1}`,
      });
    }
  }

  return {
    passed: issues.length === 0,
    report: { layer: 'L0', issues },
  };
}
