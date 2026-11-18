import crypto from "crypto";
import { execFile } from "child_process";
import { writeFile, mkdir, readFile, rm } from "fs/promises";
import path from "path";
import { promisify } from "util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { GoogleGenAI } from "@google/genai";
import {
  isDailyQuotaExhaustedError,
  markProviderExhausted,
  recordQuotaSuccess,
} from "@core/assets/quota";

const execFileAsync = promisify(execFile);

export class PollinationsPaymentRequiredError extends Error {
  public readonly status = 402;
  constructor(message = "payment_required") {
    super(message);
    this.name = "PollinationsPaymentRequiredError";
  }
}

export class PollinationsAdaptiveThrottle {
  private currentIntervalMs: number;
  private lastCallAt = 0;
  public backoffTriggered = false;
  private paymentRequiredCount = 0;
  public skippedForRun = false;

  constructor(baseIntervalMs: number) {
    this.currentIntervalMs = baseIntervalMs;
  }

  getIntervalMs(): number {
    return this.currentIntervalMs;
  }

  getPaymentRequiredCount(): number {
    return this.paymentRequiredCount;
  }

  async waitTurn(): Promise<void> {
    if (this.lastCallAt === 0) {
      this.lastCallAt = Date.now();
      return;
    }
    const elapsed = Date.now() - this.lastCallAt;
    const waitMs = this.currentIntervalMs - elapsed;
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
    this.lastCallAt = Date.now();
  }

  onRateLimit429(): number {
    this.currentIntervalMs = Math.round(this.currentIntervalMs * 1.5);
    this.backoffTriggered = true;
    return this.currentIntervalMs;
  }

  onPaymentRequired402(): { count: number; skippedForRun: boolean } {
    this.paymentRequiredCount += 1;
    if (this.paymentRequiredCount >= 3) {
      this.skippedForRun = true;
    }
    return {
      count: this.paymentRequiredCount,
      skippedForRun: this.skippedForRun,
    };
  }
}

function isPollinationsRateLimitBanner(buffer: Buffer): string | null {
  if (buffer.byteLength < 14000) {
    return `Buffer terlalu kecil (${buffer.byteLength} bytes)`;
  }
  const head = buffer
    .subarray(0, Math.min(buffer.byteLength, 4096))
    .toString("latin1")
    .toLowerCase();
  if (
    head.includes("rate limit") ||
    head.includes("free limit") ||
    head.includes("too many requests")
  ) {
    return "Terdeteksi metadata rate-limit";
  }
  return null;
}

export async function generateWithPollinations(params: {
  prompt: string;
  model: string;
  seed: number;
  width: number;
  height: number;
  throttle: PollinationsAdaptiveThrottle;
  warnings: string[];
}): Promise<Buffer> {
  const apiKey = (process.env.POLLINATIONS_API_KEY || "").trim();
  const encodedPrompt = encodeURIComponent(params.prompt);
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : "";
  const urls = [
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${params.width}&height=${params.height}&seed=${params.seed}&model=${encodeURIComponent(params.model)}&nologo=true&enhance=false${keyParam}`,
    `https://gen.pollinations.ai/image/${encodedPrompt}?width=${params.width}&height=${params.height}&seed=${params.seed}&model=${encodeURIComponent(params.model)}&nologo=true&enhance=false${keyParam}`,
  ];

  let lastErr = "";
  for (const url of urls) {
    await params.throttle.waitTurn();
    const headers: Record<string, string> = {
      Accept: "image/jpeg,image/png,image/*",
      "User-Agent": "AutonomousContentStudio/1.0",
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(url, {
      method: "GET",
      headers,
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });

    if (res.status === 402) {
      const { count, skippedForRun } = params.throttle.onPaymentRequired402();
      if (skippedForRun) {
        params.warnings.push(
          `POLLINATIONS_PAYMENT_REQUIRED: HTTP 402 muncul ${count}x, Pollinations dilewati untuk sisa run.`
        );
      }
      throw new PollinationsPaymentRequiredError("payment_required");
    }

    if (res.status === 429) {
      const bodyText = await res.text().catch(() => "");
      if (isDailyQuotaExhaustedError(res.status, bodyText, res.headers.get("retry-after"))) {
        await markProviderExhausted("pollinations");
        throw new Error(`Pollinations kuota harian habis (HTTP ${res.status})`);
      }
      const nextInterval = params.throttle.onRateLimit429();
      params.warnings.push(
        `POLLINATIONS_ADAPTIVE_BACKOFF: HTTP ${res.status}, interval dinaikkan ke ${nextInterval}ms`
      );
      lastErr = `HTTP ${res.status}`;
      continue;
    }

    if (!res.ok) {
      lastErr = `HTTP ${res.status}`;
      continue;
    }

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) {
      lastErr = `Bukan image (${ct})`;
      continue;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const bannerReason = isPollinationsRateLimitBanner(buf);
    if (bannerReason) {
      lastErr = bannerReason;
      continue;
    }

    await recordQuotaSuccess("pollinations");
    return buf;
  }

  throw new Error(`Pollinations gagal: ${lastErr || "unknown error"}`);
}

export async function fetchPixabayStockVideoOrImage(params: {
  keyword: string;
  preferVideo: boolean;
}): Promise<{
  buffer: Buffer;
  ext: "mp4" | "jpg";
  media_type: "video" | "image";
}> {
  const apiKey = (process.env.PIXABAY_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("PIXABAY_API_KEY tidak tersedia");
  }

  const cleanWords = params.keyword
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ") || "nature";

  if (params.preferVideo) {
    const vidUrl = `https://pixabay.com/api/videos/?key=${encodeURIComponent(
      apiKey
    )}&q=${encodeURIComponent(cleanWords)}&per_page=5&safesearch=true`;
    const vRes = await fetch(vidUrl, { signal: AbortSignal.timeout(10000) });
    if (vRes.ok) {
      const vData = (await vRes.json()) as {
        hits?: Array<{
          videos?: {
            medium?: { url?: string };
            small?: { url?: string };
          };
        }>;
      };
      const hit = vData.hits?.[0];
      const mp4Url = hit?.videos?.medium?.url || hit?.videos?.small?.url;
      if (mp4Url) {
        const dl = await fetch(mp4Url, { signal: AbortSignal.timeout(25000) });
        if (dl.ok) {
          const buf = Buffer.from(await dl.arrayBuffer());
          await recordQuotaSuccess("pixabay");
          return { buffer: buf, ext: "mp4", media_type: "video" };
        }
      }
    }
  }

  const imgUrl = `https://pixabay.com/api/?key=${encodeURIComponent(
    apiKey
  )}&q=${encodeURIComponent(cleanWords)}&image_type=photo&orientation=vertical&per_page=5&safesearch=true`;
  const iRes = await fetch(imgUrl, { signal: AbortSignal.timeout(10000) });
  if (!iRes.ok) {
    const bodyText = await iRes.text().catch(() => "");
    if (isDailyQuotaExhaustedError(iRes.status, bodyText, iRes.headers.get("retry-after"))) {
      await markProviderExhausted("pixabay");
    }
    throw new Error(`Pixabay HTTP ${iRes.status}`);
  }
  const iData = (await iRes.json()) as {
    hits?: Array<{ largeImageURL?: string; webformatURL?: string }>;
  };
  const picUrl = iData.hits?.[0]?.largeImageURL || iData.hits?.[0]?.webformatURL;
  if (!picUrl) {
    throw new Error(`Pixabay tidak menemukan media untuk "${cleanWords}"`);
  }
  const dl = await fetch(picUrl, { signal: AbortSignal.timeout(20000) });
  if (!dl.ok) throw new Error(`Pixabay download HTTP ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  await recordQuotaSuccess("pixabay");
  return { buffer: buf, ext: "jpg", media_type: "image" };
}

export async function generateWithGeminiImage(prompt: string): Promise<Buffer> {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY tidak tersedia");
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: `Vertical 9:16 illustration: ${prompt}`,
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const buf = Buffer.from(part.inlineData.data, "base64");
      if (buf.byteLength > 5000) {
        await recordQuotaSuccess("gemini_text");
        return buf;
      }
    }
  }
  throw new Error("Gemini Image tidak menghasilkan data gambar.");
}

/**
 * Guard dimensi 9:16 (P1-3): jika gambar bukan ~9:16 (toleransi +-5%),
 * komposisikan ulang menjadi 720x1280 dengan latar blur agar tidak memotong subjek.
 */
export async function ensureVertical916AspectGuard(params: {
  buffer: Buffer;
  ext: "jpg" | "png";
  warnings: string[];
}): Promise<{ buffer: Buffer; ext: "jpg" | "png"; padded: boolean }> {
  const tmpDir = path.join(process.cwd(), "data", `tmp-aspect-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const inPath = path.join(tmpDir, `in.${params.ext}`);
  const outPath = path.join(tmpDir, `out.jpg`);

  try {
    await writeFile(inPath, params.buffer);
    const { stdout } = await execFileAsync(ffprobeInstaller.path, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      inPath,
    ]);
    const [wStr, hStr] = stdout.trim().split("x");
    const w = Number(wStr);
    const h = Number(hStr);
    if (!w || !h) {
      return { buffer: params.buffer, ext: params.ext, padded: false };
    }

    const ratio = w / h;
    const target = 9 / 16; // 0.5625
    if (ratio >= target * 0.95 && ratio <= target * 1.05) {
      return { buffer: params.buffer, ext: params.ext, padded: false };
    }

    await execFileAsync(ffmpegInstaller.path, [
      "-y",
      "-i",
      inPath,
      "-filter_complex",
      "[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=20:5[bg];[0:v]scale=720:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2",
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outPath,
    ]);
    const paddedBuf = await readFile(outPath);
    params.warnings.push(
      `ASPECT_FIXED_BLUR_PAD: rasio asli ${w}x${h} (${ratio.toFixed(3)}) dikomposisikan ke 720x1280 tanpa crop`
    );
    return { buffer: paddedBuf, ext: "jpg", padded: true };
  } catch {
    return { buffer: params.buffer, ext: params.ext, padded: false };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}


export interface StickyProviderState {
  provider?: string;
}

export function orderChainWithStickyProvider<T extends { provider: string }>(
  chain: readonly T[],
  stickyProvider?: string
): T[] {
  if (!stickyProvider) return [...chain];
  const primary = chain.filter((s) => s.provider === stickyProvider);
  const rest = chain.filter((s) => s.provider !== stickyProvider);
  return [...primary, ...rest];
}

