import { z } from 'zod';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { generateJson } from '@core/llm/client';

const L3SentenceEvalSchema = z.object({
  ref: z.string().min(1),
  verdict: z.enum(['supported', 'overstated', 'unsupported']),
  reason: z.string().min(1),
});

const L3VerifierOutputSchema = z.object({
  evaluations: z.array(L3SentenceEvalSchema),
  extra_findings: z.array(z.string()).optional(),
});

export async function verifyScriptL3(
  script: Script,
  ledger: FactLedger,
  options?: { onCall?: () => void }
): Promise<QcReport> {
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

  if (items.length === 0) {
    return { layer: 'L3', issues: [] };
  }

  const systemInstruction = `Anda adalah auditor fakta adversarial (L3 Verifier).
Tugas Anda membandingkan setiap kalimat naskah dengan KUTIPAN ASLI ("quote") dari sumber yang dirujuk.
Bersikaplah kritis:
- "supported": kalimat didukung langsung oleh kutipan sumber tanpa melebih-lebihkan.
- "overstated": kalimat menggeneralisasi berlebihan, menambah angka/detail, atau menyimpulkan sebab-akibat yang tidak ada di kutipan.
- "unsupported": kalimat bertentangan atau tidak didukung oleh kutipan sumber yang dirujuk.
Kembalikan JSON sesuai skema: { "evaluations": [{ "ref": "S1.1", "verdict": "supported|overstated|unsupported", "reason": "..." }], "extra_findings": [] }.`;

  const prompt = `Periksa kalimat naskah berikut terhadap kutipan sumbernya:\n\n${JSON.stringify(
    items,
    null,
    2
  )}`;

  const res = await generateJson(L3VerifierOutputSchema, prompt, {
    stage: 'S4',
    systemInstruction,
    temperature: 0.1,
    onCallRecord: () => {
      options?.onCall?.();
    },
  });

  const issues: QcIssue[] = [];
  for (const ev of res.data.evaluations) {
    if (ev.verdict === 'unsupported' || ev.verdict === 'overstated') {
      issues.push({
        severity: 'error',
        message: `L3_${ev.verdict.toUpperCase()}: ${ev.reason}`,
        ref: ev.ref,
      });
    }
  }
  for (const extra of res.data.extra_findings ?? []) {
    if (extra.trim()) {
      issues.push({
        severity: 'warning',
        message: `L3_NOTE: ${extra.trim()}`,
        ref: 'script',
      });
    }
  }

  return { layer: 'L3', issues };
}
