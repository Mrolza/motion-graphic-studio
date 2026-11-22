import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LlmCallLogEntry } from '@core/llm/budget';

export interface LlmStatsSummary {
  totalCalls: number;
  totalRuns: number;
  maxCallsPerRun: number;
  callsByStage: Record<string, number>;
  callsByRun: Record<string, number>;
}

export async function aggregateLlmCallStats(
  projectDir: string,
  sinceIso?: string
): Promise<LlmStatsSummary> {
  const raw = await readFile(path.join(projectDir, 'llm-calls.jsonl'), 'utf-8').catch(() => '');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const callsByStage: Record<string, number> = {};
  const callsByRun: Record<string, number> = {};
  let totalCalls = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as LlmCallLogEntry;
      if (sinceIso && entry.ts < sinceIso) continue;
      totalCalls++;
      callsByStage[entry.stage] = (callsByStage[entry.stage] ?? 0) + 1;
      callsByRun[entry.run_id] = (callsByRun[entry.run_id] ?? 0) + 1;
    } catch {
      // skip malformed line
    }
  }

  const runCounts = Object.values(callsByRun);
  return {
    totalCalls,
    totalRuns: runCounts.length,
    maxCallsPerRun: runCounts.length > 0 ? Math.max(...runCounts) : 0,
    callsByStage,
    callsByRun,
  };
}

export function formatRenderTiming(
  renderMs: number,
  chunksSkipped: number,
  chunksCount: number
): string {
  if (chunksCount > 0 && chunksSkipped === chunksCount) {
    return 'dipakai ulang';
  }
  if (chunksSkipped > 0) {
    return `${renderMs} ms (${chunksSkipped}/${chunksCount} chunk dipakai ulang)`;
  }
  return `${renderMs} ms`;
}
