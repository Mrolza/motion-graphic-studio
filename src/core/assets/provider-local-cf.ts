import crypto from "crypto";
import { execFile } from "child_process";
import { writeFile, mkdir, readFile, rm } from "fs/promises";
import path from "path";
import { promisify } from "util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { GoogleGenAI } from "@google/genai";

const execFileAsync = promisify(execFile);
import {
  buildAssetCacheKey,
  lookupAssetCache,
  saveAssetCache,
} from "@core/assets/cache";
import {
  estimateCloudflareNeurons,
  isDailyQuotaExhaustedError,
  isProviderExhausted,
  markProviderExhausted,
  recordQuotaSuccess,
} from "@core/assets/quota";

export interface ProviderAttempt {
  provider: string;
  model?: string;
  ok: boolean;
  ms: number;
  skipped_reason?: string;
  error?: string;
}

export interface GeneratedBeatAsset {
  media_url: string;
  local_file_path: string;
  media_type: "image" | "video";
  provider: string;
  model: string;
  cache_key: string;
  cache_hit: boolean;
  cost_usd: number;
  attempts: ProviderAttempt[];
  requested_output_mode: "ai_image" | "stock_video" | "ai_video_motion";
  actual_output_mode:
    | "ai_image"
    | "stock_video"
    | "cinematic_image"
    | "cinematic_image_blur_padded";
  fallback_used: boolean;
  fallback_reason?: string;
  thumbnail_url?: string;
}

export interface ProviderChainConfig {
  chain: Array<{ provider: string; model: string }>;
  geminiImageEnabled: boolean;
  pollinationsMinIntervalMs: number;
}

export function getProviderChainConfig(): ProviderChainConfig {
  const rawChain = (
    process.env.IMAGE_PROVIDER_CHAIN ||
    "cloudflare:@cf/black-forest-labs/flux-2-klein-4b,local:fastsd,pixabay"
  ).trim();
  const chain = rawChain
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const idx = item.indexOf(":");
      if (idx === -1) return { provider: item.toLowerCase(), model: "default" };
      return {
        provider: item.slice(0, idx).trim().toLowerCase(),
        model: item.slice(idx + 1).trim() || "default",
      };
    });

  const geminiImageEnabled =
    String(process.env.GEMINI_IMAGE_ENABLED || "false").toLowerCase() === "true";
  const pollinationsMinIntervalMs = Math.max(
    1000,
    Number(process.env.POLLINATIONS_MIN_INTERVAL_MS) || 6000
  );

  return { chain, geminiImageEnabled, pollinationsMinIntervalMs };
}

/**
 * Slot provider lokal ComfyUI (H7): disiapkan untuk GPU lokal di masa depan.
 * isConfigured() mengembalikan false kecuali COMFYUI_URL diisi.
 */
export const comfyuiLocalProvider = {
  id: "comfyui-local",
  isConfigured(): boolean {
    return Boolean((process.env.COMFYUI_URL || "").trim());
  },
  async generate(): Promise<never> {
    throw new Error("comfyui-local belum diimplementasikan (slot H7).");
  },
};

/**
 * Menyusun prompt FastSD (M4.1): untuk model non-flux (SD/SDXL ~77 token),
 * dahulukan style singkat + subject_must_show + aksi/lingkungan, dipotong <= 60 kata.
 */
export function formatFastSdPrompt(
  prompt: string,
  subjectMustShow: string,
  model: string
): string {
  const cleaned = (prompt || "").replace(/\s+/g, " ").trim();
  if (model.toLowerCase().includes("flux")) {
    return cleaned;
  }
  const mustShow = (subjectMustShow || "").replace(/\s+/g, " ").trim();
  const combined = mustShow
    ? `${mustShow}, ${cleaned}`
    : cleaned;
  const words = combined.split(" ").filter(Boolean);
  return words.slice(0, 60).join(" ");
}

let fastsdHealthCache: { url: string; ok: boolean; checkedAt: number } | null = null;
let fastsdQueue: Promise<void> = Promise.resolve();

export function resetFastSdHealthCacheForTest(): void {
  fastsdHealthCache = null;
}

/**
 * Provider lokal FastSD (`local:fastsd`, M4.1) dengan health check 5 menit & antrian concurrency 1.
 */
export const fastsdLocalProvider = {
  id: "local:fastsd",
  async isConfigured(): Promise<boolean> {
    const baseUrl = (process.env.FASTSD_URL || "").trim().replace(/\/+$/, "");
    if (!baseUrl) return false;

    const now = Date.now();
    if (
      fastsdHealthCache &&
      fastsdHealthCache.url === baseUrl &&
      now - fastsdHealthCache.checkedAt < 5 * 60 * 1000
    ) {
      return fastsdHealthCache.ok;
    }

    try {
      const res = await fetch(`${baseUrl}/api/info`, {
        method: "GET",
        signal: AbortSignal.timeout(4000),
      });
      fastsdHealthCache = { url: baseUrl, ok: res.ok, checkedAt: now };
      return res.ok;
    } catch {
      fastsdHealthCache = { url: baseUrl, ok: false, checkedAt: now };
      return false;
    }
  },
  async generate(params: {
    prompt: string;
    subjectMustShow?: string;
    seed: number;
  }): Promise<Buffer> {
    const baseUrl = (process.env.FASTSD_URL || "").trim().replace(/\/+$/, "");
    if (!baseUrl) {
      throw new Error("FASTSD_URL belum dikonfigurasi.");
    }
    const model = (
      process.env.FASTSD_MODEL || "rupeshs/sdxl-turbo-openvino-int8"
    ).trim();
    const steps = Math.max(1, Number(process.env.FASTSD_STEPS) || 2);
    const width = Number(process.env.FASTSD_WIDTH) || 576;
    const height = Number(process.env.FASTSD_HEIGHT) || 1024;
    const timeoutMs = Math.max(5000, Number(process.env.FASTSD_TIMEOUT_MS) || 180000);
    const finalPrompt = formatFastSdPrompt(
      params.prompt,
      params.subjectMustShow || "",
      model
    );

    const runTask = async (): Promise<Buffer> => {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          negative_prompt:
            "text, letters, watermark, logo, signature, blurry",
          use_openvino: true,
          openvino_lcm_model_id: model,
          image_width: width,
          image_height: height,
          inference_steps: steps,
          guidance_scale: 1,
          number_of_images: 1,
          seed: params.seed,
          use_seed: true,
          diffusion_task: "text_to_image",
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        throw new Error(`FastSD HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        latency?: number;
        images?: string[];
        error?: string;
      };
      if (json.error) {
        throw new Error(`FastSD error: ${json.error}`);
      }
      const b64 = Array.isArray(json.images) ? json.images[0] : "";
      if (!b64) {
        throw new Error("FastSD tidak mengembalikan images[0].");
      }
      const cleanB64 = b64.replace(/^data:image\/[a-z]+;base64,/i, "");
      const buf = Buffer.from(cleanB64, "base64");
      if (buf.byteLength < 3000) {
        throw new Error(`FastSD buffer terlalu kecil (${buf.byteLength})`);
      }
      return buf;
    };

    // Antrian concurrency 1 (server FastSD memakai 1 state global per request)
    const next = fastsdQueue.then(runTask, runTask);
    fastsdQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  },
};

/**
 * Menyusun payload request Cloudflare Workers AI sesuai schema model (R3-10):
 * - `flux-2-klein*` wajib `multipart/form-data` (`FormData` dengan `prompt`, `width`, `height`)
 * - `flux-1-schnell` hanya menerima JSON `{ prompt }`
 * - Model lain menerima JSON `{ prompt, width, height, num_steps: 4 }`
 */
export function buildCloudflareRequestPayload(params: {
  model: string;
  prompt: string;
  width: number;
  height: number;
}): { body: FormData | string; contentType?: string } {
  if (params.model.includes("flux-2-klein")) {
    const fd = new FormData();
    fd.append("prompt", params.prompt);
    fd.append("width", String(params.width || 720));
    fd.append("height", String(params.height || 1280));
    return { body: fd };
  }
  const cfBody = params.model.includes("flux-1-schnell")
    ? { prompt: params.prompt }
    : {
        prompt: params.prompt,
        width: params.width,
        height: params.height,
        num_steps: 4,
      };
  return {
    body: JSON.stringify(cfBody),
    contentType: "application/json",
  };
}

export const cloudflareProvider = {
  id: "cloudflare",
  isConfigured(): boolean {
    return Boolean(
      (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim() &&
        (process.env.CLOUDFLARE_API_TOKEN || "").trim()
    );
  },
  async generate(params: {
    prompt: string;
    model: string;
    width: number;
    height: number;
  }): Promise<Buffer> {
    const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
    const token = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
      accountId
    )}/ai/run/${params.model}`;

    const payload = buildCloudflareRequestPayload(params);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (payload.contentType) {
      headers["Content-Type"] = payload.contentType;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: payload.body,
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (isDailyQuotaExhaustedError(res.status, errText, res.headers.get("retry-after"))) {
        await markProviderExhausted("cloudflare");
      }
      throw new Error(`Cloudflare HTTP ${res.status}: ${errText.slice(0, 140)}`);
    }

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { result?: { image?: string } };
      if (!json?.result?.image) {
        throw new Error("Cloudflare JSON tidak memiliki result.image");
      }
      const neuronsUsed = estimateCloudflareNeurons({
        model: params.model,
        width: params.width,
        height: params.height,
      });
      await recordQuotaSuccess("cloudflare", { neurons: neuronsUsed });
      return Buffer.from(json.result.image, "base64");
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 5000) {
      throw new Error(`Cloudflare buffer terlalu kecil (${buf.byteLength})`);
    }
    const neuronsUsed = estimateCloudflareNeurons({
      model: params.model,
      width: params.width,
      height: params.height,
    });
    await recordQuotaSuccess("cloudflare", { neurons: neuronsUsed });
    return buf;
  },
};

