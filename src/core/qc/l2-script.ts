import type { FactClaim, FactLedger } from '@core/contracts/fact-ledger';
import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { detectHedgeAndAbsoluteMismatches } from './hedge-glossary';
import { extractNumericValuesFromText } from './l1-ledger';

function getClaimAllowedNumbers(claim: FactClaim): number[] {
  const nums = new Set<number>();
  if (claim.value !== undefined) nums.add(claim.value);
  for (const n of extractNumericValuesFromText(claim.text)) nums.add(n);
  for (const src of claim.sources) {
    for (const n of extractNumericValuesFromText(src.quote)) nums.add(n);
  }
  return [...nums];
}

function extractMidSentenceProperNames(sentence: string): string[] {
  const words = sentence
    .replace(/^["""'(]+/, '')
    .split(/\s+/)
    .map((w) => w.replace(/^["""'(]+|[.,!?;:"""')]+$/g, ''))
    .filter(Boolean);

  const names: string[] = [];
  const skipAllCaps = new Set(['RPM', 'TMA', 'TMB', 'TTS', 'CO2', 'H2O', 'NASA', 'RI', 'AS', 'KM']);
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    if (/^[A-Z][a-z]{2,}$/.test(w) && !skipAllCaps.has(w)) {
      // Skip if preceded by sentence-ending punctuation
      const prev = words[i - 1] ?? '';
      if (!/[.!?]$/.test(prev)) {
        names.push(w);
      }
    }
  }
  return names;
}

export function countScriptWords(script: Script): number {
  return script.scenes
    .flatMap((sc) => sc.sentences)
    .map((s) => s.text.trim())
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

export function verifyScriptL2(
  script: Script,
  ledger: FactLedger,
  targetDurationSec?: number
): QcReport {
  const issues: QcIssue[] = [];
  const claimMap = new Map(ledger.claims.map((c) => [c.id, c]));

  for (const scene of script.scenes) {
    scene.sentences.forEach((sent, idx) => {
      const ref = `${scene.id}.${idx + 1}`;
      const numsInSentence = extractNumericValuesFromText(sent.text);

      if (sent.non_factual) {
        if (numsInSentence.length > 0) {
          issues.push({
            severity: 'error',
            message: `NON_FACTUAL_HAS_FACT: kalimat non-faktual mengandung angka (${numsInSentence.join(', ')})`,
            ref,
          });
        }
        return;
      }

      if (sent.claim_refs.length === 0) {
        if (numsInSentence.length > 0) {
          issues.push({
            severity: 'error',
            message: `UNSOURCED_FACT: kalimat mengandung angka (${numsInSentence.join(', ')}) tanpa claim_refs`,
            ref,
          });
        } else {
          issues.push({
            severity: 'error',
            message: 'UNSOURCED_FACT: kalimat faktual tidak memiliki claim_refs',
            ref,
          });
        }
        return;
      }

      const referencedClaims: FactClaim[] = [];
      for (const cid of sent.claim_refs) {
        const claim = claimMap.get(cid);
        if (!claim) {
          issues.push({
            severity: 'error',
            message: `BAD_CLAIM_REF: klaim "${cid}" tidak ditemukan di Fact Ledger`,
            ref,
          });
        } else if (claim.status !== 'verified') {
          issues.push({
            severity: 'error',
            message: `BAD_CLAIM_REF: klaim "${cid}" berstatus "${claim.status}" (wajib verified)`,
            ref,
          });
        } else {
          referencedClaims.push(claim);
        }
      }

      if (referencedClaims.length === 0) return;

      const allowedNums = referencedClaims.flatMap(getClaimAllowedNumbers);
      for (const n of numsInSentence) {
        const matched = allowedNums.some((a) => Math.abs(a - n) < 1e-6);
        if (!matched) {
          issues.push({
            severity: 'error',
            message: `NUMBER_NOT_IN_CLAIM: angka ${n} di naskah tidak ada di klaim rujukan (${sent.claim_refs.join(', ')})`,
            ref,
          });
        }
      }

      const claimCorpus = referencedClaims
        .map((c) => `${c.text} ${c.sources.map((s) => `${s.title} ${s.quote}`).join(' ')}`)
        .join(' ')
        .toLowerCase();
      for (const name of extractMidSentenceProperNames(sent.text)) {
        if (!claimCorpus.includes(name.toLowerCase())) {
          issues.push({
            severity: 'warning',
            message: `NAME_NOT_IN_CLAIM: nama "${name}" tidak ditemukan di klaim rujukan (${sent.claim_refs.join(', ')})`,
            ref,
          });
        }
      }

      if (referencedClaims.length > 0) {
        const allQuotes = referencedClaims.flatMap((c) => c.sources.map((s) => s.quote)).join(' ');
        const { hedgeDropped, absoluteAdded } = detectHedgeAndAbsoluteMismatches(
          sent.text,
          allQuotes
        );
        if (hedgeDropped.length > 0) {
          const desc = hedgeDropped
            .map((h) => `"${h.en}" -> butuh (${h.expectedId.join('/')})`)
            .join('; ');
          issues.push({
            severity: 'error',
            message: `L2_HEDGE_DROPPED: kalimat naskah membuang kata lunak (${desc})`,
            ref,
          });
        }
        if (absoluteAdded.length > 0) {
          issues.push({
            severity: 'error',
            message: `L2_ABSOLUTE_ADDED: kalimat naskah menambah kata mutlak (${absoluteAdded.join(', ')}) yang tidak ada di kutipan`,
            ref,
          });
        }
      }
    });
  }

  if (targetDurationSec && targetDurationSec > 0) {
    const wordCount = countScriptWords(script);
    const idealWords = Math.round(targetDurationSec * 2.3);
    const minWords = Math.round(idealWords * 0.8);
    const maxWords = Math.round(idealWords * 1.2);
    if (wordCount < minWords || wordCount > maxWords) {
      issues.push({
        severity: 'warning',
        message: `DURATION_WORD_COUNT: jumlah kata ${wordCount} di luar rentang ideal ${minWords}–${maxWords} kata untuk target ${targetDurationSec} detik`,
        ref: 'script',
      });
    }
  }

  return { layer: 'L2', issues };
}
