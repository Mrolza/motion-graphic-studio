import { z } from 'zod';
import type { FactClaim } from '@core/contracts/fact-ledger';
import type { QcIssue } from '@core/contracts/qc-report';
import { generateJson } from '@core/llm/client';

const L1SemanticItemSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['supported', 'embellished', 'hedge_dropped']),
  reason: z.string().optional().default(''),
});

const L1SemanticResponseSchema = z.object({
  results: z.array(L1SemanticItemSchema),
});

export interface L1SemanticResult {
  issues: QcIssue[];
  unverifiedIds: Set<string>;
  called: boolean;
}

/**
 * 1-call LLM verifier comparing each verified claim's Indonesian paraphrase against its original source quotes.
 * Flags embellishments (L1_EMBELLISHED) and dropped hedges / added absolutes (L1_HEDGE_DROPPED).
 */
export async function verifyLedgerL1Semantic(
  claims: FactClaim[],
  options?: {
    generateJsonFn?: typeof generateJson;
    onCall?: () => void;
  }
): Promise<L1SemanticResult> {
  const activeClaims = claims.filter((c) => c.status === 'verified');
  if (activeClaims.length === 0) {
    return { issues: [], unverifiedIds: new Set(), called: false };
  }

  const genFn = options?.generateJsonFn ?? generateJson;
  const payload = activeClaims.map((c) => ({
    id: c.id,
    claim_text: c.text,
    quotes: c.sources.map((s) => s.quote).filter(Boolean),
  }));

  const systemInstruction = `Anda adalah auditor kesetiaan fakta (L1 Semantic Verifier).
Tugas Anda membandingkan setiap "claim_text" (parafrasa Indonesia) dengan "quotes" (kutipan sumber asli).
ATURAN KETAT:
1. "supported": makna claim_text setia pada kutipan, tanpa melebih-lebihkan, tanpa menghapus kata hedge/peluang (seperti "most", "less chance", "may", "about"), dan tanpa menambahkan kata mutlak ("tanpa", "selalu", "pasti", "terus", "semua") yang tidak ada di kutipan.
2. "hedge_dropped": kutipan memakai kata pembatas/peluang/frekuensi ("most", "less chance", "tend to", "about", "usually", "may"), tetapi claim_text menghilangkannya atau menggantinya dengan pernyataan mutlak ("tanpa", "selalu", "terus", "semua", "pasti").
3. "embellished": claim_text menambahkan mekanisme, sebab-akibat, angka, atau klaim baru yang tidak tertulis di kutipan.
Kembalikan JSON { "results": [{ "id": "...", "status": "supported"|"embellished"|"hedge_dropped", "reason": "..." }] }.`;

  const prompt = `Audit klaim berikut terhadap kutipan aslinya:\n${JSON.stringify(payload, null, 2)}`;

  const res = await genFn(L1SemanticResponseSchema, prompt, {
    stage: 'S2',
    systemInstruction,
    onCallRecord: options?.onCall,
  });

  const issues: QcIssue[] = [];
  const unverifiedIds = new Set<string>();
  const validIds = new Set(activeClaims.map((c) => c.id));

  for (const r of res.data.results) {
    if (!validIds.has(r.id)) continue;
    if (r.status === 'embellished') {
      unverifiedIds.add(r.id);
      issues.push({
        severity: 'error',
        message: `L1_EMBELLISHED: klaim ${r.id} melebih-lebihkan kutipan (${r.reason || 'tidak tertulis di kutipan'})`,
        ref: r.id,
      });
    } else if (r.status === 'hedge_dropped') {
      unverifiedIds.add(r.id);
      issues.push({
        severity: 'error',
        message: `L1_HEDGE_DROPPED: klaim ${r.id} menghilangkan hedge/menambah mutlak dibanding kutipan (${r.reason || 'hedge hilang'})`,
        ref: r.id,
      });
    }
  }

  return { issues, unverifiedIds, called: true };
}
