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
  reasons: Map<string, string>;
  called: boolean;
}

const ReparaphraseResponseSchema = z.object({
  claims: z.array(
    z.object({
      id: z.string().min(1),
      text: z.string().min(1),
    })
  ),
});

/**
 * 1-call LLM helper to re-paraphrase claims that failed L1 due to dropped hedges,
 * added absolutes, or embellishment, strictly from their original source quotes.
 */
export async function reparaphraseFailedClaims(
  failedClaims: FactClaim[],
  options?: {
    generateJsonFn?: typeof generateJson;
    projectDir?: string;
    onCall?: () => void;
  }
): Promise<Map<string, string>> {
  if (failedClaims.length === 0) return new Map();
  const genFn = options?.generateJsonFn ?? generateJson;
  const payload = failedClaims.map((c) => ({
    id: c.id,
    old_text: c.text,
    reason: c.status_reason ?? '',
    quotes: c.sources.map((s) => s.quote).filter(Boolean),
  }));

  const systemInstruction = `Anda adalah editor parafrasa fakta yang sangat ketat.
Tugas Anda memperbaiki "old_text" untuk setiap klaim yang gagal L1 agar 100% setia pada "quotes":
1. PERTAHANKAN setiap kata hedge/peluang/frekuensi dari kutipan asli:
   - "most" -> "sebagian besar" / "umumnya"
   - "about" / "approximately" -> "sekitar" / "kurang lebih"
   - "less chance" -> "peluang lebih kecil"
   - "tend to" -> "cenderung"
   - "may" -> "dapat", "usually" -> "biasanya", "often" -> "sering", "some" -> "beberapa"
2. DILARANG menambahkan kata mutlak ("tanpa", "selalu", "tidak pernah", "pasti", "terus", "semua") kecuali kutipan memakai padanannya ("without", "always", "never", "all").
3. DILARANG menambahkan fakta, angka, atau sebab-akibat di luar "quotes".
Kembalikan JSON persis: { "claims": [{ "id": "...", "text": "..." }] }.`;

  const prompt = `Perbaiki parafrasa klaim berikut agar lolos L1:\n${JSON.stringify(payload, null, 2)}`;
  const res = await genFn(ReparaphraseResponseSchema, prompt, {
    stage: 'S2',
    purpose: 'reparaphrase_l1',
    projectDir: options?.projectDir,
    systemInstruction,
    onCallRecord: options?.onCall,
  });

  const out = new Map<string, string>();
  for (const item of res.data.claims) {
    if (item.text.trim()) out.set(item.id, item.text.trim());
  }
  return out;
}

/**
 * 1-call LLM verifier comparing each verified claim's Indonesian paraphrase against its original source quotes.
 * Flags embellishments (L1_EMBELLISHED) and dropped hedges / added absolutes (L1_HEDGE_DROPPED).
 */
export async function verifyLedgerL1Semantic(
  claims: FactClaim[],
  options?: {
    generateJsonFn?: typeof generateJson;
    projectDir?: string;
    onCall?: () => void;
  }
): Promise<L1SemanticResult> {
  const activeClaims = claims.filter((c) => c.status === 'verified');
  if (activeClaims.length === 0) {
    return { issues: [], unverifiedIds: new Set(), reasons: new Map(), called: false };
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
    purpose: 'l1_semantic',
    projectDir: options?.projectDir,
    systemInstruction,
    onCallRecord: options?.onCall,
  });

  const issues: QcIssue[] = [];
  const unverifiedIds = new Set<string>();
  const reasons = new Map<string, string>();
  const validIds = new Set(activeClaims.map((c) => c.id));

  for (const r of res.data.results) {
    if (!validIds.has(r.id)) continue;
    if (r.status === 'embellished') {
      const msg = `L1_EMBELLISHED: klaim ${r.id} melebih-lebihkan kutipan (${r.reason || 'tidak tertulis di kutipan'})`;
      unverifiedIds.add(r.id);
      reasons.set(r.id, msg);
      issues.push({ severity: 'error', message: msg, ref: r.id });
    } else if (r.status === 'hedge_dropped') {
      const msg = `L1_HEDGE_DROPPED: klaim ${r.id} menghilangkan hedge/menambah mutlak dibanding kutipan (${r.reason || 'hedge hilang'})`;
      unverifiedIds.add(r.id);
      reasons.set(r.id, msg);
      issues.push({ severity: 'error', message: msg, ref: r.id });
    }
  }

  return { issues, unverifiedIds, reasons, called: true };
}
