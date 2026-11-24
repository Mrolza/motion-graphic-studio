import { z } from 'zod';
import { ClaimKindSchema } from '@core/contracts/fact-ledger';

export const ExtractedClaimSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1),
  value: z.number().nullish(),
  unit: z.string().min(1).nullish(),
  kind: ClaimKindSchema,
  step_id: z.string().min(1).nullish(),
  source_id: z.string().min(1),
  quote: z.string().min(1),
  supports_core_claim_indices: z.array(z.number().int().nonnegative()).optional(),
});

export const SourceEvalSchema = z.object({
  source_id: z.string().min(1),
  relevance: z.enum(['relevant', 'partial', 'irrelevant']),
  reason: z.string().optional(),
});

export const ExtractionResponseSchema = z.object({
  source_evaluations: z.any().optional(),
  claims: z.array(ExtractedClaimSchema).min(1),
});

export const FollowUpQuerySchema = z.object({
  wiki_titles: z
    .object({
      en: z.array(z.string().min(1)).max(4).optional().default([]),
      id: z.array(z.string().min(1)).max(3).optional().default([]),
    })
    .optional(),
  search_queries: z.array(z.string().min(1)).max(4).optional().default([]),
});

export interface SourceReportEntry {
  source_id: string;
  title: string;
  lang: string;
  url: string;
  relevance: 'relevant' | 'partial' | 'irrelevant';
  reason: string;
  kept: boolean;
}

export interface QuoteScoreResult {
  score: number;
  penalties: string[];
}

const REFERENCE_START_RE =
  /^(?:this|that|it|these|those|at\s+this\s+point|the\s+stroke|ini|itu|hal\s+ini|hal\s+tersebut|langkah\s+tersebut|langkah\s+ini)\b/i;

const PARENTHETICAL_RE = /\([^)]{3,}\)|\bassuming\b/i;

/**
 * Scores how self-contained and clear a source quote is for narration extraction.
 * Higher is better (max 100). Contradictory directions (e.g. "downwards ... BDC to TDC")
 * receive a heavy penalty so consistent quotes win.
 */
export function scoreQuoteClarity(quote: string): QuoteScoreResult {
  let score = 100;
  const penalties: string[] = [];
  const trimmed = quote.trim();

  if (REFERENCE_START_RE.test(trimmed)) {
    score -= 35;
    penalties.push('starts_with_reference(-35)');
  }

  if (PARENTHETICAL_RE.test(trimmed)) {
    score -= 20;
    penalties.push('parenthetical_aside(-20)');
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount > 45) {
    score -= 20;
    penalties.push(`too_long_${wordCount}w(-20)`);
  }

  const hasTdcToBdc = /\bT\.?D\.?C\.?\s*(?:to|ke|→|-)\s*B\.?D\.?C\.?\b/i.test(trimmed);
  const hasBdcToTdc = /\bB\.?D\.?C\.?\s*(?:to|ke|→|-)\s*T\.?D\.?C\.?\b/i.test(trimmed);
  const hasDown = /\b(?:downward|downwards|down|turun|ke\s+bawah)\b/i.test(trimmed);
  const hasUp = /\b(?:upward|upwards|up|naik|ke\s+atas)\b/i.test(trimmed);

  if ((hasTdcToBdc && hasUp) || (hasBdcToTdc && hasDown)) {
    score -= 60;
    penalties.push('contradictory_direction(-60)');
  }

  return { score: Math.max(0, score), penalties };
}

export interface QuoteCandidate {
  id: string;
  step_id?: string;
  sourceTitle: string;
  quote: string;
  status: string;
}

export function buildQuoteSelectionMarkdown(
  candidates: QuoteCandidate[]
): { markdown: string; bestByStep: Map<string, string> } {
  const scored = candidates.map((c) => {
    const res = scoreQuoteClarity(c.quote);
    return { ...c, score: res.score, penalties: res.penalties };
  });

  const bestByStep = new Map<string, string>();
  for (const item of scored) {
    if (!item.step_id || item.status !== 'verified') continue;
    const prevId = bestByStep.get(item.step_id);
    const prev = prevId ? scored.find((s) => s.id === prevId) : undefined;
    if (!prev || item.score > prev.score) {
      bestByStep.set(item.step_id, item.id);
    }
  }

  const rows = scored.map((s) => {
    const picked = s.step_id ? (bestByStep.get(s.step_id) === s.id ? 'YA (terbaik)' : 'CADANGAN') : s.status === 'verified' ? 'YA' : 'TIDAK';
    const preview = s.quote.replace(/\|/g, '\\|').slice(0, 110) + (s.quote.length > 110 ? '…' : '');
    return `| ${s.id} | ${s.step_id ?? '-'} | ${s.sourceTitle} | ${s.score} | ${s.penalties.join(', ') || '-'} | ${s.status} | ${picked} | ${preview} |`;
  });

  const markdown = `# Pemilihan & Skor Kutipan\n\n| Klaim | Step ID | Sumber | Skor | Penalti | Status | Dipilih | Kutipan |\n|---|---|---|---:|---|---|---|---|\n${rows.join('\n')}\n`;
  return { markdown, bestByStep };
}
