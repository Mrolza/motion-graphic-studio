import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export class LlmBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmBudgetExceededError';
  }
}

export class QuotaPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaPreflightError';
  }
}

export interface LlmCallLogEntry {
  ts: string;
  run_id: string;
  stage: string;
  purpose: string;
  scene_id: string | null;
  attempt: number;
  http_retries: number;
  ok: boolean;
}

export function computeStableHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

export function resolveRunBudgetLimit(override?: number): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) return override;
  const envVal = Number(process.env.MGS_LLM_BUDGET_PER_RUN ?? 20);
  return Number.isFinite(envVal) && envVal > 0 ? envVal : 20;
}

/**
 * Appends a logical LLM call record to projects/<id>/llm-calls.jsonl.
 * HTTP retries (503/429) are recorded in `http_retries` and do NOT count as extra logical calls.
 */
export async function appendLlmCallLog(
  projectDir: string,
  entry: LlmCallLogEntry
): Promise<void> {
  await mkdir(projectDir, { recursive: true });
  await appendFile(path.join(projectDir, 'llm-calls.jsonl'), `${JSON.stringify(entry)}\n`, 'utf-8');
}

/**
 * Checks `.mgs/quota.json` and `GEMINI_RPD_LIMIT` before starting a run.
 */
export async function checkQuotaBeforeRun(params: {
  estimatedCalls: number;
  rpdLimit?: number;
  repoRoot?: string;
}): Promise<{ ok: boolean; usedToday: number; limit?: number }> {
  const repoRoot = params.repoRoot ?? process.cwd();
  const limit =
    params.rpdLimit ??
    (process.env.GEMINI_RPD_LIMIT ? Number(process.env.GEMINI_RPD_LIMIT) : undefined);

  let usedToday = 0;
  try {
    const raw = await readFile(path.join(repoRoot, '.mgs', 'quota.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { gemini?: { used?: number }; date?: string };
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date === today && typeof parsed.gemini?.used === 'number') {
      usedToday = parsed.gemini.used;
    }
  } catch {
    usedToday = 0;
  }

  if (limit && Number.isFinite(limit) && limit > 0 && usedToday + params.estimatedCalls > limit) {
    throw new QuotaPreflightError(
      `QUOTA_PREFLIGHT_FAILED: estimasi ${params.estimatedCalls} panggilan + terpakai ${usedToday} melebihi GEMINI_RPD_LIMIT=${limit}. Kuota harian pulih pukul 00.00 Pacific (15.00 WIB saat PST).`
    );
  }

  return { ok: true, usedToday, limit };
}

/**
 * Tracks logical LLM calls in a single run and enforces MGS_LLM_BUDGET_PER_RUN.
 */
export class RunLlmTracker {
  public readonly runId: string;
  public readonly limit: number;
  public readonly projectDir: string;
  private logicalCalls = 0;

  constructor(params: { projectDir: string; runId?: string; limit?: number }) {
    this.projectDir = params.projectDir;
    this.runId = params.runId ?? `run-${Date.now()}`;
    this.limit = resolveRunBudgetLimit(params.limit);
  }

  get usedCalls(): number {
    return this.logicalCalls;
  }

  assertCanCall(stage: string, purpose: string): void {
    if (this.logicalCalls >= this.limit) {
      throw new LlmBudgetExceededError(
        `LLM_BUDGET_EXCEEDED: batas ${this.limit} panggilan logis per run tercapai sebelum ${stage} (${purpose}). State disimpan agar run dapat dilanjutkan.`
      );
    }
  }

  async recordCall(params: {
    stage: string;
    purpose: string;
    scene_id?: string | null;
    attempt?: number;
    http_retries?: number;
    ok: boolean;
  }): Promise<void> {
    this.logicalCalls++;
    await appendLlmCallLog(this.projectDir, {
      ts: new Date().toISOString(),
      run_id: this.runId,
      stage: params.stage,
      purpose: params.purpose,
      scene_id: params.scene_id ?? null,
      attempt: params.attempt ?? 1,
      http_retries: params.http_retries ?? 0,
      ok: params.ok,
    });
  }
}
