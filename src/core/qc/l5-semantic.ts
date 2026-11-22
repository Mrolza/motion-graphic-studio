import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import type { Storyboard } from '@core/contracts/storyboard';
import { generateJson } from '@core/llm/client';
import type { RunLlmTracker } from '@core/llm/budget';
import { z } from 'zod';

export const QUANTITY_LABELS: Record<string, string> = {
  crank_angle: 'Sudut Poros Engkol',
  lateral_shift: 'Geser Lateral',
  distance: 'Jarak Tempuh',
  effective_diameter: 'Diameter Efektif',
  progress: 'Progres Siklus',
  inertia: 'Gaya Inersia',
};

const ABSOLUTE_WORDS = ['tanpa', 'selalu', 'tidak pernah', 'pasti', 'kontinu', 'semua'];
const HEDGE_WORDS = ['about', 'less', 'tend', 'most', 'may', 'usually', 'some', 'chance'];

export const L5SemanticErrorCodeSchema = z.enum([
  'L5_SEMANTIC_OVERSTATEMENT',
  'L5_SEMANTIC_DROPPED_CONDITION',
  'L5_SEMANTIC_UNSUPPORTED',
  'L5_OFF_TOPIC_TITLE',
]);

const L5SemanticLlmSchema = z.object({
  items: z.array(
    z.object({
      hud_id: z.string(),
      verdict: z.enum(['OK', 'ERROR']),
      code: L5SemanticErrorCodeSchema.optional(),
      reason: z.string(),
    })
  ),
});

export interface L5SemanticVerdict {
  hud_id: string;
  scene_id: string;
  text: string;
  claim_ref?: string;
  verdict: 'OK' | 'ERROR';
  code?: z.infer<typeof L5SemanticErrorCodeSchema>;
  reason: string;
  hints: string[];
}

export function extractHudDisplayText(props: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const k of ['title', 'subtitle', 'label', 'detail', 'valueText', 'text', 'leftTitle', 'leftValue', 'rightTitle', 'rightValue', 'dateText']) {
    const v = props[k];
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
  }
  for (const k of ['items', 'steps']) {
    const arr = props[k];
    if (Array.isArray(arr)) {
      parts.push(...arr.filter((x): x is string => typeof x === 'string'));
    }
  }
  return parts.join(' — ');
}

/**
 * Deterministic pre-check for absolute words in HUD paired with hedging words in source quote.
 */
export function precheckAbsoluteWords(hudText: string, quoteText: string): string[] {
  const lowerHud = hudText.toLowerCase();
  const lowerQuote = quoteText.toLowerCase();
  const foundAbs = ABSOLUTE_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(lowerHud));
  const foundHedge = HEDGE_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(lowerQuote));
  if (foundAbs.length > 0 && foundHedge.length > 0) {
    return [
      `L5_ABSOLUTE_WORD: kata mutlak (${foundAbs.join(', ')}) di HUD dipadukan dengan kata lunak (${foundHedge.join(', ')}) di kutipan`,
    ];
  }
  if (foundAbs.length > 0 && !quoteText.trim()) {
    return [`L5_ABSOLUTE_WORD: kata mutlak (${foundAbs.join(', ')}) tanpa kutipan sumber`];
  }
  return [];
}

/**
 * Runs 1 LLM semantic verifier pass over all storyboard HUD texts against their claim quotes (or topic).
 */
export async function verifyStoryboardL5Semantic(params: {
  topic: string;
  storyboard: Storyboard;
  ledger: FactLedger;
  tracker?: RunLlmTracker;
  onCall?: () => void;
}): Promise<{ report: QcReport; verdicts: L5SemanticVerdict[] }> {
  const { topic, storyboard, ledger, tracker, onCall } = params;
  const claimMap = new Map(ledger.claims.map((c) => [c.id, c]));
  const issues: QcIssue[] = [];

  const entries: Array<{
    hud_id: string;
    scene_id: string;
    text: string;
    claim_ref?: string;
    reference: string;
    hints: string[];
  }> = [];

  for (const s of storyboard.scenes) {
    s.hud.forEach((h, idx) => {
      const hid = h.hud_id ?? `${s.id}_H${idx + 1}`;
      const text = extractHudDisplayText(h.props ?? {});
      const claim = h.claim_ref ? claimMap.get(h.claim_ref) : undefined;
      const quote = claim?.sources[0]?.quote ?? claim?.text ?? '';
      const hints = precheckAbsoluteWords(text, quote);
      for (const hint of hints) {
        issues.push({ severity: 'warning', message: hint, ref: `${s.id}:${hid}` });
      }
      entries.push({
        hud_id: hid,
        scene_id: s.id,
        text,
        claim_ref: h.claim_ref,
        reference: quote
          ? `Klaim ${h.claim_ref}: "${quote}"`
          : `Topik/pertanyaan video (ilustratif): "${topic}"`,
        hints,
      });
    });
  }

  const prompt =
    `Periksa makna SEMUA teks HUD storyboard berikut terhadap kutipan sumbernya (atau topik video jika ilustratif).\n` +
    `Aturan ketat:\n` +
    `- L5_SEMANTIC_OVERSTATEMENT: klaim dilebih-lebihkan (mis. "less chance" menjadi "tanpa", "most" menjadi "semua").\n` +
    `- L5_SEMANTIC_DROPPED_CONDITION: syarat penting atau kata lunak ("tanpa bentuk kerucut", "cenderung") dihilangkan sehingga makna berubah.\n` +
    `- L5_SEMANTIC_UNSUPPORTED: kata sifat/klaim baru tidak ada di sumber (mis. "Kontinu" padahal hanya 1 dari 4 langkah).\n` +
    `- L5_OFF_TOPIC_TITLE: judul/subjudul ilustratif tidak tepat sasaran terhadap topik "${topic}".\n` +
    `Jika teks akurat, setia pada syarat/nuansa sumber, dan relevan dengan topik, beri verdict="OK".\n\n` +
    `Kembalikan JSON persis:\n{"items":[{"hud_id":string,"verdict":"OK"|"ERROR","code":"L5_SEMANTIC_OVERSTATEMENT"|"L5_SEMANTIC_DROPPED_CONDITION"|"L5_SEMANTIC_UNSUPPORTED"|"L5_OFF_TOPIC_TITLE" (jika ERROR),"reason":string}]}\n\n` +
    `Daftar HUD:\n${JSON.stringify(entries, null, 2)}`;

  const res = await generateJson(L5SemanticLlmSchema, prompt, {
    stage: 'S7',
    purpose: 'l5_semantic',
    tracker,
    onCallRecord: onCall,
  });

  const verdictMap = new Map(res.data.items.map((it) => [it.hud_id, it]));
  const verdicts: L5SemanticVerdict[] = entries.map((e) => {
    const v = verdictMap.get(e.hud_id);
    if (v && v.verdict === 'ERROR') {
      const code = v.code ?? 'L5_SEMANTIC_UNSUPPORTED';
      issues.push({
        severity: 'error',
        message: `${code}: HUD "${e.hud_id}" ("${e.text}") — ${v.reason}`,
        ref: `${e.scene_id}:${e.hud_id}`,
      });
      return {
        hud_id: e.hud_id,
        scene_id: e.scene_id,
        text: e.text,
        claim_ref: e.claim_ref,
        verdict: 'ERROR',
        code,
        reason: v.reason,
        hints: e.hints,
      };
    }
    return {
      hud_id: e.hud_id,
      scene_id: e.scene_id,
      text: e.text,
      claim_ref: e.claim_ref,
      verdict: 'OK',
      reason: v?.reason ?? 'Sesuai sumber/topik',
      hints: e.hints,
    };
  });

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  return {
    report: {
      layer: 'L5',
      issues,
    },
    verdicts,
  };
}
