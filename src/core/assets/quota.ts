import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type ProviderId = "gemini_text" | "pollinations" | "cloudflare" | "pixabay";

export const CLOUDFLARE_DAILY_NEURON_LIMIT = 10_000;

/**
 * Tarif neuron Workers AI per model (berdasarkan pricing Cloudflare Workers AI, R3-11).
 */
export const CLOUDFLARE_NEURON_RATES: Record<
  string,
  { perTile: number; perStep: number; defaultSteps: number }
> = {
  "@cf/black-forest-labs/flux-2-klein-4b": {
    perTile: 26.05,
    perStep: 0,
    defaultSteps: 4,
  },
  "@cf/black-forest-labs/flux-1-schnell": {
    perTile: 14.25,
    perStep: 0,
    defaultSteps: 4,
  },
  "@cf/leonardo/lucid-origin": {
    perTile: 636,
    perStep: 12,
    defaultSteps: 4,
  },
  "@cf/leonardo/phoenix-1.0": {
    perTile: 480,
    perStep: 10,
    defaultSteps: 4,
  },
};

export function estimateCloudflareNeurons(params: {
  model: string;
  width?: number;
  height?: number;
  steps?: number;
}): number {
  const isSchnell = params.model.includes("flux-1-schnell");
  const w = isSchnell ? 1024 : params.width || 720;
  const h = isSchnell ? 1024 : params.height || 1280;
  const tiles = Math.max(1, Math.ceil(w / 512)) * Math.max(1, Math.ceil(h / 512));
  const rate = CLOUDFLARE_NEURON_RATES[params.model] || {
    perTile: 150,
    perStep: 0,
    defaultSteps: 4,
  };
  const steps = params.steps ?? rate.defaultSteps;
  return Math.round(rate.perTile * tiles + rate.perStep * steps);
}

export function estimateRunNeuronNeed(
  beatCount: number,
  model: string,
  width = 720,
  height = 1280
): number {
  const perImage = estimateCloudflareNeurons({ model, width, height });
  return Math.round(Math.max(0, beatCount) * 1.3 * perImage);
}

export interface QuotaState {
  date_utc: string;
  used: Record<ProviderId, number>;
  cloudflare_neurons: number;
  exhausted_until: Partial<Record<ProviderId, string>>;
}

const QUOTA_FILE_PATH = path.join(process.cwd(), ".mgs", "quota.json");

function getTodayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function getNextUtcMidnightIso(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 5)
  );
  return next.toISOString();
}

function createFreshQuotaState(): QuotaState {
  return {
    date_utc: getTodayUtc(),
    used: {
      gemini_text: 0,
      pollinations: 0,
      cloudflare: 0,
      pixabay: 0,
    },
    cloudflare_neurons: 0,
    exhausted_until: {},
  };
}

let writeQueue: Promise<void> = Promise.resolve();

export async function readQuotaState(): Promise<QuotaState> {
  const today = getTodayUtc();
  try {
    const raw = await readFile(QUOTA_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<QuotaState>;
    if (parsed.date_utc !== today) {
      const fresh = createFreshQuotaState();
      await writeQuotaState(fresh);
      return fresh;
    }
    return {
      date_utc: today,
      used: {
        gemini_text: Number(parsed.used?.gemini_text) || 0,
        pollinations: Number(parsed.used?.pollinations) || 0,
        cloudflare: Number(parsed.used?.cloudflare) || 0,
        pixabay: Number(parsed.used?.pixabay) || 0,
      },
      cloudflare_neurons: Number(parsed.cloudflare_neurons) || 0,
      exhausted_until: parsed.exhausted_until || {},
    };
  } catch {
    const fresh = createFreshQuotaState();
    await writeQuotaState(fresh);
    return fresh;
  }
}

async function writeQuotaState(state: QuotaState): Promise<void> {
  await mkdir(path.dirname(QUOTA_FILE_PATH), { recursive: true });
  await writeFile(QUOTA_FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export async function recordQuotaSuccess(
  provider: ProviderId,
  opts?: { neurons?: number }
): Promise<QuotaState> {
  let latest = createFreshQuotaState();
  writeQueue = writeQueue.then(async () => {
    const state = await readQuotaState();
    state.used[provider] = (state.used[provider] || 0) + 1;
    if (provider === "cloudflare" && typeof opts?.neurons === "number" && opts.neurons > 0) {
      state.cloudflare_neurons = (state.cloudflare_neurons || 0) + opts.neurons;
    }
    await writeQuotaState(state);
    latest = state;
  });
  await writeQueue;
  return latest;
}

export const CLOUDFLARE_RETRY_COOLDOWN_MS = 60 * 60 * 1000;

export async function markProviderExhausted(
  provider: ProviderId,
  untilIso?: string
): Promise<QuotaState> {
  let latest = createFreshQuotaState();
  writeQueue = writeQueue.then(async () => {
    const state = await readQuotaState();
    const defaultUntil =
      provider === "cloudflare"
        ? new Date(Date.now() + CLOUDFLARE_RETRY_COOLDOWN_MS).toISOString()
        : getNextUtcMidnightIso();
    state.exhausted_until[provider] = untilIso || defaultUntil;
    await writeQuotaState(state);
    latest = state;
  });
  await writeQueue;
  return latest;
}

export async function resetExhaustedProviders(): Promise<QuotaState> {
  let latest = createFreshQuotaState();
  writeQueue = writeQueue.then(async () => {
    const state = await readQuotaState();
    state.exhausted_until = {};
    await writeQuotaState(state);
    latest = state;
  });
  await writeQueue;
  return latest;
}

export async function isProviderExhausted(provider: ProviderId): Promise<boolean> {
  const state = await readQuotaState();
  const until = state.exhausted_until[provider];
  if (!until) return false;
  return Date.parse(until) > Date.now();
}

/**
 * Membedakan rate limit per menit (cukup tunggu & retry) dari kuota harian habis (lewati provider).
 */
export function isDailyQuotaExhaustedError(
  status: number,
  bodyText = "",
  retryAfterHeader?: string | null
): boolean {
  const lower = bodyText.toLowerCase();
  const retrySec = retryAfterHeader ? Number(retryAfterHeader) : 0;
  if (Number.isFinite(retrySec) && retrySec > 3600) {
    return true;
  }
  if (
    lower.includes("daily") ||
    lower.includes("per day") ||
    lower.includes("day limit") ||
    lower.includes("insufficient_quota") ||
    lower.includes("exceeded your current quota") ||
    lower.includes("monthly limit") ||
    lower.includes("credits exhausted") ||
    (status === 402 && lower.includes("limit"))
  ) {
    return true;
  }
  return false;
}
