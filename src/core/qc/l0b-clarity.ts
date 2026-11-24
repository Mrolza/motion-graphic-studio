import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcIssue } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';

const VAGUE_PHRASES: Array<{ label: string; re: RegExp }> = [
  { label: 'dari satu titik ke titik lain', re: /\bdari\s+satu\s+titik\s+ke\s+titik\s+lain\b/i },
  { label: 'pada titik tertentu', re: /\bpada\s+titik\s+tertentu\b/i },
  { label: 'hal tersebut (awal kalimat)', re: /^hal\s+tersebut\b/i },
  { label: 'dan sebagainya', re: /\bdan\s+sebagainya\b/i },
];

const DANGLING_STEP_RE = /^(?:langkah|tahap|proses)\s+(?:tersebut|ini)\b/i;

const STEP_SYNONYMS: Record<string, string[]> = {
  hisap: ['hisap', 'isap', 'intake', 'pemasukan'],
  isap: ['hisap', 'isap', 'intake', 'pemasukan'],
  kompresi: ['kompresi', 'pemampatan', 'tekan', 'memampatkan'],
  usaha: ['usaha', 'tenaga', 'daya', 'pembakaran'],
  tenaga: ['usaha', 'tenaga', 'daya', 'pembakaran'],
  buang: ['buang', 'pembuangan', 'knalpot', 'gas buang'],
};

const STEP_STOP_WORDS = new Set(['langkah', 'tahap', 'proses', 'bagian', 'fase', 'stroke']);

export function getStepAliases(stepName: string): string[] {
  const words = stepName
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STEP_STOP_WORDS.has(w));
  const out = new Set<string>(words);
  for (const w of words) {
    for (const syn of STEP_SYNONYMS[w] ?? []) out.add(syn);
  }
  return [...out];
}

export function sentenceNamesStep(sentenceText: string, stepName: string): boolean {
  const lower = sentenceText.toLowerCase();
  return getStepAliases(stepName).some((alias) => lower.includes(alias));
}

/**
 * Deterministic script clarity checks (P4G Part B):
 * - L0B_STEP_UNNAMED
 * - L0B_VAGUE_PHRASE
 * - L0B_DANGLING_REFERENCE
 * - Sentence length: > 20 words warning, > 28 words error
 */
export function checkScriptClarity(
  script: Script,
  options?: { keySteps?: string[]; ledger?: FactLedger; onlyRefs?: Set<string> }
): QcIssue[] {
  const issues: QcIssue[] = [];
  const claimMap = new Map((options?.ledger?.claims ?? []).map((c) => [c.id, c]));

  for (const scene of script.scenes) {
    scene.sentences.forEach((sent, idx) => {
      const ref = `${scene.id}.${idx + 1}`;
      if (options?.onlyRefs && !options.onlyRefs.has(ref)) return;

      const text = sent.text.trim();
      const words = text.split(/\s+/).filter(Boolean).length;

      for (const vp of VAGUE_PHRASES) {
        if (vp.re.test(text)) {
          issues.push({
            severity: 'error',
            message: `L0B_VAGUE_PHRASE: frasa kosong "${vp.label}" tidak menjelaskan mekanisme`,
            ref,
          });
        }
      }

      if (DANGLING_STEP_RE.test(text)) {
        const hasNamedStep = (options?.keySteps ?? []).some((st) => sentenceNamesStep(text, st));
        if (!hasNamedStep) {
          issues.push({
            severity: 'error',
            message: `L0B_DANGLING_REFERENCE: kalimat diawali rujukan gantung ("Langkah tersebut/ini") tanpa menyebut nama langkahnya`,
            ref,
          });
        }
      }

      // Check step_id naming on claims referenced by this sentence
      for (const cid of sent.claim_refs) {
        const claim = claimMap.get(cid);
        if (claim?.step_id && !sentenceNamesStep(text, claim.step_id)) {
          issues.push({
            severity: 'error',
            message: `L0B_STEP_UNNAMED: kalimat merujuk klaim "${cid}" (${claim.step_id}) tetapi tidak menyebut nama langkah "${claim.step_id}"`,
            ref,
          });
        }
      }

      if (words > 28) {
        issues.push({
          severity: 'error',
          message: `L0B_SENTENCE_TOO_LONG: kalimat ${words} kata (> 28 kata)`,
          ref,
        });
      } else if (words > 20) {
        issues.push({
          severity: 'warning',
          message: `L0B_SENTENCE_LONG: kalimat ${words} kata (> 20 kata)`,
          ref,
        });
      }
    });
  }

  return issues;
}
