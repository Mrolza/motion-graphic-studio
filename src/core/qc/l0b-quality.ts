import { z } from 'zod';
import type { FactLedger } from '@core/contracts/fact-ledger';
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
  verdict: z.enum(['supported', 'overstated', 'unsupported']),
  reason: z.string().min(1),
});

export const CombinedVerifierOutputSchema = z.object({
  l0b: z.object({
    answers_question: z.boolean(),
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
  scores: z.infer<typeof L0bScoresSchema>;
  report: QcReport;
}

export interface CombinedQcResult {
  l0b: L0bResult;
  l3Report: QcReport;
}

export async function verifyScriptL0bAndL3(params: {
  topic: string;
  concept?: Concept;
  script: Script;
  ledger: FactLedger;
  onCall?: (model: string) => void;
}): Promise<CombinedQcResult> {
  const { topic, concept, script, ledger, onCall } = params;
  const claimMap = new Map(ledger.claims.map((c) => [c.id, c]));

  const items: Array<{
    ref: string;
    text: string;
    claims: Array<{ id: string; text: string; quote: string }>;
  }> = [];

  for (const scene of script.scenes) {
    scene.sentences.forEach((sent, idx) => {
      if (sent.non_factual) return;
      const ref = `${scene.id}.${idx + 1}`;
      const claims = sent.claim_refs
        .map((cid) => claimMap.get(cid))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({
          id: c.id,
          text: c.text,
          quote: c.sources[0]?.quote ?? '',
        }));
      items.push({ ref, text: sent.text, claims });
    });
  }

  const systemInstruction = `Anda adalah auditor kualitas & fakta adversarial (L0b + L3).
Lakukan DUA pemeriksaan dalam satu JSON:

BAGIAN 1 — L0b (Relevansi & Kualitas Naskah):
1. answers_direct (1-5): Apakah naskah menjawab pertanyaan topik secara langsung, dan jawaban inti muncul cepat (±10 detik pertama setelah hook)?
2. coverage (1-5): Apakah core_claims konsep terpilih tersampaikan?
3. structure (1-5): Apakah alurnya jelas (hook -> sebab/mekanisme -> akibat -> payoff) dan hook dibayar?
4. on_topic (1-5): Apakah seluruh bagian tetap relevan pada topik (tidak menyimpang membahas satu kasus/objek lain yang tidak menjawab pertanyaan)?
Set "answers_question": true hanya jika naskah benar-benar menjawab pertanyaan topik.

BAGIAN 2 — L3 (Verifier Fakta Ketat):
Bandingkan setiap kalimat faktual dengan KUTIPAN ASLI ("quote") klaim yang dirujuk:
- "supported": didukung langsung oleh kutipan tanpa melebih-lebihkan.
- "overstated": menggeneralisasi berlebihan (ATURAN KHUSUS: generalisasi dari satu model/produk/kejadian spesifik ke kelas umum, misalnya "bogie CL243 pakai suspensi udara" -> "semua kereta memakai suspensi udara", WAJIB dinilai "overstated"), atau menambah sebab-akibat/angka yang tidak ada di kutipan.
- "unsupported": bertentangan atau tidak didukung oleh kutipan sumber.

Kembalikan JSON sesuai skema:
{
  "l0b": { "answers_question": true|false, "scores": { "answers_direct": 1..5, "coverage": 1..5, "structure": 1..5, "on_topic": 1..5 }, "issues": ["..."] },
  "l3": { "evaluations": [{ "ref": "S1.1", "verdict": "supported|overstated|unsupported", "reason": "..." }], "extra_findings": [] }
}`;

  const prompt = `Topik: "${topic}"
${concept ? `Konsep terpilih: "${concept.title}"\nCore claims:\n${concept.core_claims.map((c, i) => `- [${i}] ${c}`).join('\n')}` : ''}

Naskah lengkap:
${JSON.stringify(script, null, 2)}

Pasangan kalimat faktual & kutipan sumber untuk L3:
${JSON.stringify(items, null, 2)}`;

  const res = await generateJson(CombinedVerifierOutputSchema, prompt, {
    stage: 'S4',
    systemInstruction,
    temperature: 0.1,
    onCallRecord: (rec) => {
      onCall?.(rec.model);
    },
  });

  const l0bIssues: QcIssue[] = [];
  const { answers_question, scores, issues: rawL0bIssues } = res.data.l0b;
  if (!answers_question) {
    l0bIssues.push({
      severity: 'error',
      message: 'L0B_NOT_ANSWERING: naskah tidak menjawab pertanyaan topik',
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
        severity: !answers_question ? 'error' : 'warning',
        message: `L0B_NOTE: ${msg.trim()}`,
        ref: 'script',
      });
    }
  }

  const l3Issues: QcIssue[] = [];
  for (const ev of res.data.l3.evaluations) {
    if (ev.verdict === 'unsupported' || ev.verdict === 'overstated') {
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

  return {
    l0b: {
      answers_question,
      scores,
      report: { layer: 'L0b', issues: l0bIssues },
    },
    l3Report: { layer: 'L3', issues: l3Issues },
  };
}
