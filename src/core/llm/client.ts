import { z } from 'zod';
import {
  buildGeminiThinkingConfig,
  GEMINI_REQUEST_TIMEOUT_MS,
  resolveGeminiModel,
} from './gemini-config';

export class DailyQuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DailyQuotaExhaustedError';
  }
}

export interface LlmCallRecord {
  stage: string;
  model: string;
  durationMs: number;
  ok: boolean;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export interface GenerateJsonOptions {
  stage?: string;
  model?: string;
  apiKey?: string;
  systemInstruction?: string;
  temperature?: number;
  timeoutMs?: number;
  maxTransientRetries?: number;
  maxSchemaRetries?: number;
  retryDelayMs?: number;
  onCallRecord?: (record: LlmCallRecord) => void | Promise<void>;
}

export interface GenerateJsonResult<T> {
  data: T;
  model: string;
  attempts: number;
  totalDurationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

function isDailyQuotaMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('perday') ||
    lower.includes('per_day') ||
    lower.includes('daily quota') ||
    lower.includes('daily limit') ||
    lower.includes('free_tier_requests') ||
    (lower.includes('quota') && lower.includes('day'))
  );
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffWithJitter(baseDelayMs: number, retryIndex: number): number {
  if (baseDelayMs <= 0) return 0;
  const exp = baseDelayMs * Math.pow(2, retryIndex - 1);
  const jitter = Math.floor(Math.random() * Math.min(1000, baseDelayMs));
  return Math.min(60_000, exp + jitter);
}

export async function generateJson<T>(
  schema: z.ZodType<T>,
  prompt: string,
  opts: GenerateJsonOptions = {}
): Promise<GenerateJsonResult<T>> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment');
  }

  let model = resolveGeminiModel(opts.model);
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL?.trim();
  let triedFallback = false;
  const stage = opts.stage ?? 'unknown';
  const timeoutMs = opts.timeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS;
  const maxTransientRetries = opts.maxTransientRetries ?? 5;
  const maxSchemaRetries = opts.maxSchemaRetries ?? 2;
  const baseDelayMs = opts.retryDelayMs ?? 2000;

  let currentPrompt = prompt;
  let attempts = 0;
  let transientCount = 0;
  let schemaFailCount = 0;
  const tStartAll = Date.now();

  while (true) {
    attempts++;
    const tCall = Date.now();
    let res: Response;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`;
      const body: Record<string, unknown> = {
        contents: [{ role: 'user', parts: [{ text: currentPrompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          responseMimeType: 'application/json',
          thinkingConfig: buildGeminiThinkingConfig(model),
        },
      };
      if (opts.systemInstruction) {
        body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
      }

      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const durationMs = Date.now() - tCall;
      const msg = err instanceof Error ? err.message : String(err);
      await opts.onCallRecord?.({ stage, model, durationMs, ok: false, error: msg });
      if (transientCount < maxTransientRetries) {
        transientCount++;
        await sleep(computeBackoffWithJitter(baseDelayMs, transientCount));
        continue;
      }
      throw new Error(`Gemini request failed after ${attempts} attempts: ${msg}`);
    }

    const durationMs = Date.now() - tCall;
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      await opts.onCallRecord?.({
        stage,
        model,
        durationMs,
        ok: false,
        error: `HTTP ${res.status}: ${errText.slice(0, 300)}`,
      });

      if (res.status === 429 && isDailyQuotaMessage(errText)) {
        throw new DailyQuotaExhaustedError(`Daily Gemini quota exhausted: ${errText.slice(0, 300)}`);
      }

      const isTransientStatus = res.status === 503 || res.status === 429 || res.status === 500;
      if (isTransientStatus && transientCount < maxTransientRetries) {
        transientCount++;
        await sleep(computeBackoffWithJitter(baseDelayMs, transientCount));
        continue;
      }
      if (res.status === 503 && fallbackModel && fallbackModel !== model && !triedFallback) {
        triedFallback = true;
        model = fallbackModel;
        continue;
      }
      throw new Error(`Gemini HTTP ${res.status} (${model}): ${errText.slice(0, 300)}`);
    }

    const payload = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const usage = {
      inputTokens: payload.usageMetadata?.promptTokenCount,
      outputTokens: payload.usageMetadata?.candidatesTokenCount,
    };

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonText(text));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await opts.onCallRecord?.({ stage, model, durationMs, ok: false, ...usage, error: `Invalid JSON: ${msg}` });
      if (schemaFailCount < maxSchemaRetries) {
        schemaFailCount++;
        currentPrompt = `${prompt}\n\nPrevious response was not valid JSON (${msg}). Return ONLY valid JSON.`;
        continue;
      }
      throw new Error(`Gemini returned invalid JSON after ${attempts} attempts: ${msg}`);
    }

    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      const zodErr = validated.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      await opts.onCallRecord?.({ stage, model, durationMs, ok: false, ...usage, error: `Zod: ${zodErr}` });
      if (schemaFailCount < maxSchemaRetries) {
        schemaFailCount++;
        currentPrompt = `${prompt}\n\nPrevious JSON failed schema validation: ${zodErr}\nFix all fields and return ONLY valid JSON.`;
        continue;
      }
      throw new Error(`Gemini JSON failed schema validation: ${zodErr}`);
    }

    await opts.onCallRecord?.({ stage, model, durationMs, ok: true, ...usage });
    return {
      data: validated.data,
      model,
      attempts,
      totalDurationMs: Date.now() - tStartAll,
      usage,
    };
  }
}
