import { z } from 'zod';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { VideoFormat } from '@core/contracts/project';
import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { generateJson } from '@core/llm/client';
import type { Concept } from '@core/stages/ideate';

export const L0bScoresSchema = z.object({
  answers_direct: z.number().int().min(1).max(5),
  coverage: z.number().int().min(1).max(5),
  structure: z.number().int().min(1).max(5),
  on_topic: z.number().int().min(1).max(5),
});

export const L3SentenceEvalSchema = z.object({
  ref: z.string().min(1),
  verdict: z.enum(['supported', 'overstated', 'unsupported', 'non_factual_assertion']),
  reason: z.string().min(1),
});

export const CombinedVerifierOutputSchema = z.object({
  l0b: z.object({
    answers_question: z.boolean(),
    has_off_topic_scene: z.boolean(),
    hook_paid: z.boolean(),
    main_event_dated: z.boolean().optional(),
    main_event_named: z.boolean().optional(),
    scores: L0bScoresSchema,
    issues: z.array(z.string()),
  }),
  l3: z.object({
    evaluations: z.array(L3SentenceEvalSchema),
    extra_findings: z.array(z.string()).optional(),
  }),
});

export interface L0bResult {
  answers_question: boolean;
  has_off_topic_scene: boolean;
  hook_paid: boolean;
  scores: z.infer<typeof L0bScoresSchema>;
  report: QcReport;
}

export interface CombinedQcResult {
  l0b: L0bResult;
  l3Report: QcReport;
}

export interface StepCoverageRow {
  step: string;
  covered: boolean;
  sentenceRef: string | null;
  sentenceText: string | null;
  claimRefs: string[];
}

function normalizeStepKey(step: string): string[] {
  const tokens = step
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  if (tokens.includes('usaha')) tokens.push('tenaga');
  if (tokens.includes('tenaga')) tokens.push('usaha');
  if (tokens.includes('hisap')) tokens.push('isap');
  return tokens;
}

function stepMatchesId(step: string, stepId: string | undefined): boolean {
  if (!stepId) return false;
  const a = step.toLowerCase().trim();
  const b = stepId.toLowerCase().trim();
  if (a === b) return true;
  const aTokens = normalizeStepKey(step);
  const bTokens = normalizeStepKey(stepId);
  return aTokens.some((t) => bTokens.includes(t));
}

export function checkKeyStepsCoverage(
  keySteps: string[] | undefined,
  script: Script,
  ledger: FactLedger
): { issues: QcIssue[]; rows: StepCoverageRow[] } {
  const issues: QcIssue[] = [];
  const rows: StepCoverageRow[] = [];
  if (!keySteps || keySteps.length === 0) return { issues, rows };

  const verifiedClaims = ledger.claims.filter((c) => c.status === 'verified');
  const verifiedById = new Map(verifiedClaims.map((c) => [c.id, c]));
  const sentences = script.scenes.flatMap((sc) =>
    sc.sentences.map((s, idx) => ({ ref: `${sc.id}.${idx + 1}`, sent: s }))
  );

  const countStepsMentioned = (text: string): number => {
    const lower = text.toLowerCase();
    return keySteps.filter((st) => normalizeStepKey(st).some((tok) => lower.includes(tok))).length;
  };

  for (const step of keySteps) {
    const match = sentences.find(({ sent }) => {
      if (sent.non_factual) return false;
      // Kalimat daftar yang menyebut >= 3 langkah tidak dihitung sebagai kalimat khusus
      if (countStepsMentioned(sent.text) >= 3) return false;
      return sent.claim_refs.some((cid) => {
        const claim = verifiedById.get(cid);
        return claim ? stepMatchesId(step, claim.step_id) : false;
      });
    });
    if (!match) {
      issues.push({
        severity: 'error',
        message: `L0B_STEP_MISSING: langkah proses "${step}" belum punya kalimat khusus dengan klaim verified bertanda step_id="${step}"`,
        ref: step,
      });
      rows.push({ step, covered: false, sentenceRef: null, sentenceText: null, claimRefs: [] });
    } else {
      rows.push({
        step,
        covered: true,
        sentenceRef: match.ref,
        sentenceText: match.sent.text,
        claimRefs: match.sent.claim_refs.filter((cid) => {
          const claim = verifiedById.get(cid);
          return claim ? stepMatchesId(step, claim.step_id) : false;
        }),
      });
    }
  }
  return { issues, rows };
}

export async function verifyScriptL0bAndL3(params: {
  topic: string;
  format?: VideoFormat;
  concept?: Concept;
  script: Script;
  ledger: FactLedger;
  projectDir?: string;
  onCall?: (model: string) => void;
  generateJsonFn?: typeof generateJson;
}): Promise<CombinedQcResult> {
  const { topic, format, concept, script, ledger, projectDir, onCall, generateJsonFn } = params;
  const claimMap = new Map(ledger.claims.map((c) => [c.id, c]));

  const items: Array<{
    ref: string;
    non_factual: boolean;
    text: string;
    claims: Array<{ id: string; claim_text: string; quotes: string[] }>;
  }> = [];

  for (const scene of script.scenes) {
    scene.sentences.forEach((sent, idx) => {
      const ref = `${scene.id}.${idx + 1}`;
      const claims = sent.claim_refs
        .map((cid) => claimMap.get(cid))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({
          id: c.id,
          claim_text: c.text,
          quotes: c.sources.map((s) => s.quote).filter(Boolean),
        }));
      items.push({ ref, non_factual: Boolean(sent.non_factual), text: sent.text, claims });
    });
  }

  const historyRule =
    format === 'today_in_history'
      ? `\n6. KHUSUS today_in_history:\n   - "main_event_dated": true HANYA jika adegan 1–2 menyebut kejadian utama lengkap dengan tanggal dan tahunnya (misalnya "20 Juli 1969, Apollo 11 mendarat di Bulan").\n   - "main_event_named": true HANYA jika narasi secara eksplisit menyebut nama kejadian/misi utama (misalnya "Apollo 11", bukan hanya nama modul atau tokohnya).`
      : '';

  const systemInstruction = `Anda adalah auditor kualitas & fakta adversarial (L0b + L3).
Lakukan DUA pemeriksaan dalam satu JSON:

BAGIAN 1 — L0b (Relevansi & Kualitas Naskah):
1. answers_direct (1-5): Apakah naskah menjawab pertanyaan topik secara langsung, dan jawaban inti muncul cepat (±10 detik pertama setelah hook)?
2. coverage (1-5): Apakah core_claims konsep terpilih tersampaikan?
3. structure (1-5): Apakah alurnya jelas (hook -> sebab/mekanisme -> akibat -> payoff) dan hook dibayar?
4. on_topic (1-5): Apakah seluruh adegan tetap relevan pada topik? Set "has_off_topic_scene": true jika ada adegan yang menyimpang/tidak relevan (misalnya membahas topik lain).
5. hook_paid: Set false jika hook di S1 menyebut fakta, perbandingan, atau janji spesifik (misalnya "memori komputer lebih kecil dari ponsel/smartphone") yang TIDAK dibahas dan dijawab lagi di adegan S2–S4. Set true hanya jika topik/janji hook benar-benar dibayar di isi naskah.${historyRule}
Set "answers_question": true hanya jika naskah benar-benar menjawab pertanyaan topik.

BAGIAN 2 — L3 (Verifier Fakta Ketat):
Periksa SEMUA kalimat (termasuk yang non_factual: true):
- Jika "non_factual": true — hanya boleh pertanyaan retoris murni, transisi, atau ajakan (kalimat tanya retoris murni seperti "Tahukah kamu bagaimana X bekerja?" adalah SAH dan diberi verdict "supported"). Jika berisi kalimat pernyataan faktual atau penilaian tentang subjek (misalnya "efisien", "andal", "tercanggih", "desain terbaik") → verdict WAJIB "non_factual_assertion".
- Jika kalimat faktual — bandingkan kalimat naskah ("text") LANGSUNG terhadap kutipan sumber asli ("quotes"), bukan hanya "claim_text":
  - "supported": kalimat naskah didukung langsung oleh "quotes" tanpa mengubah makna, tanpa menghilangkan kata hedge/peluang di "quotes", dan tanpa menambahkan kata mutlak ("tanpa", "selalu", "pasti", "terus", "semua") yang tidak ada di "quotes".
  - "overstated": menggeneralisasi berlebihan (satu model/produk -> semua kereta/mesin), ATAU **menghilangkan/mengubah kuantitas/subjek/cakupan sehingga maknanya berubah** (misalnya "dua putaran" menjadi "putaran penuh", "sebagian besar" menjadi "semua", "wheelset" menjadi "lokomotif"), ATAU menambah sebab-akibat yang tidak ada di kutipan.
  - "unsupported": bertentangan atau tidak didukung kutipan, atau claim_text tidak didukung oleh quote-nya.

Kembalikan JSON sesuai skema:
{
  "l0b": { "answers_question": true|false, "has_off_topic_scene": true|false, "hook_paid": true|false, "main_event_dated": true|false, "main_event_named": true|false, "scores": { "answers_direct": 1..5, "coverage": 1..5, "structure": 1..5, "on_topic": 1..5 }, "issues": ["..."] },
  "l3": { "evaluations": [{ "ref": "S1.1", "verdict": "supported|overstated|unsupported|non_factual_assertion", "reason": "..." }], "extra_findings": [] }
}`;

  const prompt = `Topik: "${topic}"${format ? ` (Format: ${format})` : ''}
${concept ? `Konsep terpilih: "${concept.title}"\nCore claims:\n${concept.core_claims.map((c, i) => `- [${i}] ${c}`).join('\n')}` : ''}

Naskah lengkap:
${JSON.stringify(script, null, 2)}

Pasangan kalimat, claim_text, & kutipan sumber untuk L3:
${JSON.stringify(items, null, 2)}`;

  const genFn = generateJsonFn ?? generateJson;
  const res = await genFn(CombinedVerifierOutputSchema, prompt, {
    stage: 'S4',
    purpose: 'l0b_l3_verify',
    projectDir,
    systemInstruction,
    temperature: 0.1,
    onCallRecord: (rec) => {
      onCall?.(rec.model);
    },
  });

  const l0bIssues: QcIssue[] = [];
  const {
    answers_question,
    has_off_topic_scene,
    hook_paid,
    main_event_dated,
    main_event_named,
    scores,
    issues: rawL0bIssues,
  } = res.data.l0b;

  if (!answers_question) {
    l0bIssues.push({
      severity: 'error',
      message: 'L0B_NOT_ANSWERING: naskah tidak menjawab pertanyaan topik',
      ref: 'script',
    });
  }
  if (has_off_topic_scene) {
    l0bIssues.push({
      severity: 'error',
      message: 'L0B_OFF_TOPIC: terdapat adegan yang menyimpang / tidak relevan dengan topik',
      ref: 'script',
    });
  }
  if (!hook_paid) {
    l0bIssues.push({
      severity: 'error',
      message: 'L0B_HOOK_UNPAID: janji atau topik pada hook (S1) tidak dibahas di isi naskah',
      ref: 'S1',
    });
  }
  if (format === 'today_in_history' && main_event_dated === false) {
    l0bIssues.push({
      severity: 'error',
      message: 'L0B_MISSING_MAIN_EVENT: adegan 1–2 wajib menyebut kejadian utama lengkap dengan tanggal dan tahunnya',
      ref: 'S1',
    });
  }
  if (format === 'today_in_history' && main_event_named === false) {
    l0bIssues.push({
      severity: 'error',
      message: 'L0B_MISSING_MAIN_EVENT_NAME: narasi wajib menyebut nama kejadian/misi utama secara eksplisit (mis. "Apollo 11")',
      ref: 'script',
    });
  }
  for (const [k, v] of Object.entries(scores)) {
    if (v < 3) {
      l0bIssues.push({
        severity: 'error',
        message: `L0B_LOW_SCORE: skor ${k} = ${v}/5 (< 3)`,
        ref: 'script',
      });
    }
  }
  for (const msg of rawL0bIssues) {
    if (msg.trim()) {
      l0bIssues.push({
        severity: !answers_question || has_off_topic_scene ? 'error' : 'warning',
        message: `L0B_NOTE: ${msg.trim()}`,
        ref: 'script',
      });
    }
  }

  const sentByRef = new Map(
    items.map((it) => [it.ref, it])
  );
  const l3Issues: QcIssue[] = [];
  for (const ev of res.data.l3.evaluations) {
    if (ev.verdict === 'non_factual_assertion') {
      const sentItem = sentByRef.get(ev.ref);
      const isPureQuestion =
        sentItem?.non_factual &&
        sentItem.text.trim().endsWith('?') &&
        !/\d/.test(sentItem.text);
      if (isPureQuestion) continue;
      l3Issues.push({
        severity: 'error',
        message: `NON_FACTUAL_ASSERTION: ${ev.reason}`,
        ref: ev.ref,
      });
    } else if (ev.verdict === 'unsupported' || ev.verdict === 'overstated') {
      l3Issues.push({
        severity: 'error',
        message: `L3_${ev.verdict.toUpperCase()}: ${ev.reason}`,
        ref: ev.ref,
      });
    }
  }
  for (const extra of res.data.l3.extra_findings ?? []) {
    if (extra.trim()) {
      l3Issues.push({
        severity: 'warning',
        message: `L3_NOTE: ${extra.trim()}`,
        ref: 'script',
      });
    }
  }

  const stepCov = checkKeyStepsCoverage(concept?.key_steps, script, ledger);
  l0bIssues.push(...stepCov.issues);

  return {
    l0b: {
      answers_question,
      has_off_topic_scene,
      hook_paid,
      scores,
      report: { layer: 'L0b', issues: l0bIssues },
    },
    l3Report: { layer: 'L3', issues: l3Issues },
  };
}
