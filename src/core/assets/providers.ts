import { buildAssetCacheKey, lookupAssetCache, saveAssetCache } from "@core/assets/cache";
import { isDailyQuotaExhaustedError, isProviderExhausted, markProviderExhausted, recordQuotaSuccess } from "@core/assets/quota";
import {
  type ProviderAttempt,
  type GeneratedBeatAsset,
  type ProviderChainConfig,
  getProviderChainConfig,
  comfyuiLocalProvider,
  fastsdLocalProvider,
  cloudflareProvider,
} from "@core/assets/provider-local-cf";
import {
  PollinationsPaymentRequiredError,
  PollinationsAdaptiveThrottle,
  generateWithPollinations,
  fetchPixabayStockVideoOrImage,
  generateWithGeminiImage,
  ensureVertical916AspectGuard,
  type StickyProviderState,
  orderChainWithStickyProvider,
} from "@core/assets/provider-remote";
export * from "@core/assets/provider-local-cf";
export { PollinationsPaymentRequiredError, PollinationsAdaptiveThrottle, type StickyProviderState, orderChainWithStickyProvider } from "@core/assets/provider-remote";
/**
 * Asset Engineer: mengeksekusi cache lookup -> provider chain (atau Pixabay stock video untuk source="stock").
 */
export async function generateBeatAssetWithChain(params: {
  visualPrompt: string;
  stockKeyword: string;
  source: "ai" | "stock";
  seed: number;
  width?: number;
  height?: number;
  bypassCache?: boolean;
  allowStockFallback?: boolean;
  stickyProviderState?: StickyProviderState;
  throttle: PollinationsAdaptiveThrottle;
  warnings: string[];
}): Promise<GeneratedBeatAsset> {
  const width = params.width || 720;
  const height = params.height || 1280;
  const config = getProviderChainConfig();
  const attempts: ProviderAttempt[] = [];
  // 1. Mode H6: Motion gratis untuk preset realistis (source = "stock")
  if (params.source === "stock") {
    const stockCacheKey = buildAssetCacheKey({
      provider_id: "pixabay_stock",
      model: "video",
      visual_prompt_en: params.stockKeyword,
      seed: 0,
      width,
      height,
    });
    if (!params.bypassCache) {
      const cached = await lookupAssetCache(stockCacheKey);
      if (cached) {
        return {
          media_url: cached.media_url,
          local_file_path: cached.local_file_path,
          media_type: cached.media_type,
          provider: cached.provider_id,
          model: cached.model,
          cache_key: stockCacheKey,
          cache_hit: true,
          cost_usd: 0,
          attempts: [{ provider: "cache", ok: true, ms: 0 }],
          requested_output_mode: "stock_video",
          actual_output_mode: "stock_video",
          fallback_used: false,
        };
      }
    }
    const t0 = Date.now();
    try {
      const stock = await fetchPixabayStockVideoOrImage({
        keyword: params.stockKeyword,
        preferVideo: true,
      });
      const saved = await saveAssetCache({
        hash: stockCacheKey,
        buffer: stock.buffer,
        ext: stock.ext,
        media_type: stock.media_type,
        provider_id: "pixabay",
        model: stock.media_type === "video" ? "stock_video" : "stock_photo",
      });
      attempts.push({
        provider: "pixabay",
        model: saved.model,
        ok: true,
        ms: Date.now() - t0,
      });
      return {
        media_url: saved.media_url,
        local_file_path: saved.local_file_path,
        media_type: saved.media_type,
        provider: "pixabay",
        model: saved.model,
        cache_key: stockCacheKey,
        cache_hit: false,
        cost_usd: 0,
        attempts,
        requested_output_mode: "stock_video",
        actual_output_mode:
          stock.media_type === "video" ? "stock_video" : "cinematic_image",
        fallback_used: stock.media_type !== "video",
        fallback_reason:
          stock.media_type !== "video" ? "pixabay_video_unavailable" : undefined,
      };
    } catch (err) {
      attempts.push({
        provider: "pixabay",
        model: "stock_video",
        ok: false,
        ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  // 2. Cek Cache terlebih dahulu untuk semua provider di IMAGE_PROVIDER_CHAIN
  if (!params.bypassCache) {
    for (const step of config.chain) {
      const key = buildAssetCacheKey({
        provider_id: step.provider,
        model: step.model,
        visual_prompt_en: params.visualPrompt,
        seed: params.seed,
        width,
        height,
      });
      const cached = await lookupAssetCache(key);
      if (cached) {
        return {
          media_url: cached.media_url,
          local_file_path: cached.local_file_path,
          media_type: cached.media_type,
          provider: cached.provider_id,
          model: cached.model,
          cache_key: key,
          cache_hit: true,
          cost_usd: 0,
          attempts: [{ provider: "cache", ok: true, ms: 0 }],
          requested_output_mode: "ai_image",
          actual_output_mode: "cinematic_image",
          fallback_used: false,
        };
      }
    }
  }
  // 3. Jalankan IMAGE_PROVIDER_CHAIN berurutan (R3-3: sticky provider + no stock untuk preset ilustratif)
  let fallbackUsed = false;
  let fallbackReason: string | undefined;
  const orderedChain = orderChainWithStickyProvider(
    config.chain,
    params.stickyProviderState?.provider
  );
  for (let i = 0; i < orderedChain.length; i++) {
    const step = orderedChain[i];
    const t0 = Date.now();
    if (step.provider === "pixabay" && params.allowStockFallback === false) {
      attempts.push({
        provider: "pixabay",
        model: step.model,
        ok: false,
        ms: 0,
        skipped_reason: "illustrative_preset_no_stock",
      });
      continue;
    }
    if (step.provider === "gemini" && !config.geminiImageEnabled) {
      attempts.push({
        provider: "gemini",
        model: step.model,
        ok: false,
        ms: 0,
        skipped_reason: "skipped_by_config",
      });
      continue;
    }
    if (
      (step.provider === "local" && step.model === "fastsd") ||
      step.provider === "fastsd"
    ) {
      const ok = await fastsdLocalProvider.isConfigured();
      if (!ok) {
        attempts.push({
          provider: "local:fastsd",
          model: process.env.FASTSD_MODEL || "rupeshs/sdxl-turbo-openvino-int8",
          ok: false,
          ms: 0,
          skipped_reason: "skipped_by_config",
        });
        continue;
      }
    }
    if (step.provider === "comfyui-local" && !comfyuiLocalProvider.isConfigured()) {
      attempts.push({
        provider: "comfyui-local",
        model: step.model,
        ok: false,
        ms: 0,
        skipped_reason: "not_configured",
      });
      continue;
    }
    if (step.provider === "pollinations" && params.throttle.skippedForRun) {
      attempts.push({
        provider: "pollinations",
        model: step.model,
        ok: false,
        ms: 0,
        skipped_reason: "payment_required_run_skip",
      });
      fallbackUsed = true;
      fallbackReason = "pollinations_payment_required";
      continue;
    }
    if (step.provider === "cloudflare" && !cloudflareProvider.isConfigured()) {
      attempts.push({
        provider: "cloudflare",
        model: step.model,
        ok: false,
        ms: 0,
        skipped_reason: "not_configured",
      });
      continue;
    }
    const quotaProvider =
      step.provider === "pollinations" ||
      step.provider === "cloudflare" ||
      step.provider === "pixabay"
        ? step.provider
        : null;
    if (quotaProvider && (await isProviderExhausted(quotaProvider))) {
      attempts.push({
        provider: step.provider,
        model: step.model,
        ok: false,
        ms: 0,
        skipped_reason: "daily_quota_exhausted",
      });
      fallbackUsed = true;
      fallbackReason = `${step.provider}_daily_quota_exhausted`;
      continue;
    }
    try {
      let buffer: Buffer;
      let ext: "jpg" | "png" | "mp4" = "jpg";
      let mediaType: "image" | "video" = "image";
      if (step.provider === "pollinations") {
        buffer = await generateWithPollinations({
          prompt: params.visualPrompt,
          model: step.model,
          seed: params.seed,
          width,
          height,
          throttle: params.throttle,
          warnings: params.warnings,
        });
      } else if (step.provider === "cloudflare") {
        buffer = await cloudflareProvider.generate({
          prompt: params.visualPrompt,
          model: step.model,
          width,
          height,
        });
        ext = "png";
      } else if (
        (step.provider === "local" && step.model === "fastsd") ||
        step.provider === "fastsd"
      ) {
        buffer = await fastsdLocalProvider.generate({
          prompt: params.visualPrompt,
          subjectMustShow: params.stockKeyword,
          seed: params.seed,
        });
        ext = "jpg";
      } else if (step.provider === "pixabay") {
        const px = await fetchPixabayStockVideoOrImage({
          keyword: params.stockKeyword,
          preferVideo: false,
        });
        buffer = px.buffer;
        ext = px.ext;
        mediaType = px.media_type;
      } else if (step.provider === "gemini") {
        buffer = await generateWithGeminiImage(params.visualPrompt);
        ext = "png";
      } else {
        throw new Error(`Provider tidak dikenal: ${step.provider}`);
      }
      let blurPadded = false;
      if (mediaType === "image") {
        const guarded = await ensureVertical916AspectGuard({
          buffer,
          ext: ext === "png" ? "png" : "jpg",
          warnings: params.warnings,
        });
        buffer = guarded.buffer;
        ext = guarded.ext;
        blurPadded = guarded.padded;
      }
      const cacheKey = buildAssetCacheKey({
        provider_id: step.provider,
        model: step.model,
        visual_prompt_en: params.visualPrompt,
        seed: params.seed,
        width,
        height,
      });
      const saved = await saveAssetCache({
        hash: cacheKey,
        buffer,
        ext,
        media_type: mediaType,
        provider_id: step.provider,
        model: step.model,
      });
      attempts.push({
        provider: step.provider,
        model: step.model,
        ok: true,
        ms: Date.now() - t0,
      });
      if (params.stickyProviderState) {
        if (!params.stickyProviderState.provider) {
          params.stickyProviderState.provider = step.provider;
        } else if (params.stickyProviderState.provider !== step.provider) {
          params.warnings.push(
            `STYLE_PROVIDER_SWITCH: berpindah provider dari ${params.stickyProviderState.provider} ke ${step.provider}`
          );
          params.stickyProviderState.provider = step.provider;
        }
      }
      return {
        media_url: saved.media_url,
        local_file_path: saved.local_file_path,
        media_type: mediaType,
        provider: step.provider,
        model: step.model,
        cache_key: cacheKey,
        cache_hit: false,
        cost_usd: 0,
        attempts,
        requested_output_mode:
          params.source === "stock" ? "stock_video" : "ai_image",
        actual_output_mode:
          mediaType === "video"
            ? "stock_video"
            : blurPadded
              ? "cinematic_image_blur_padded"
              : "cinematic_image",
        fallback_used: fallbackUsed || i > 0,
        fallback_reason: fallbackReason,
      };
    } catch (err) {
      const isPaymentRequired =
        err instanceof PollinationsPaymentRequiredError;
      const msg = isPaymentRequired
        ? "payment_required"
        : err instanceof Error
          ? err.message
          : String(err);
      attempts.push({
        provider: step.provider,
        model: step.model,
        ok: false,
        ms: Date.now() - t0,
        error: msg,
      });
      fallbackUsed = true;
      fallbackReason = isPaymentRequired
        ? "pollinations_payment_required"
        : `${step.provider}_failed: ${msg.slice(0, 80)}`;
    }
  }
  const errSummary = attempts
    .map((a) => `${a.provider}:${a.skipped_reason || a.error || "failed"}`)
    .join(" | ");
  throw new Error(`Seluruh IMAGE_PROVIDER_CHAIN gagal: ${errSummary}`);
}
