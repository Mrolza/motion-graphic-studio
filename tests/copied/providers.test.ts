import { afterEach, describe, expect, it } from "vitest";
import {
  buildCloudflareRequestPayload,
  getProviderChainConfig,
  orderChainWithStickyProvider,
  PollinationsAdaptiveThrottle,
} from "@core/assets/providers";

describe("getProviderChainConfig", () => {
  const originalChain = process.env.IMAGE_PROVIDER_CHAIN;
  const originalGemini = process.env.GEMINI_IMAGE_ENABLED;

  afterEach(() => {
    if (originalChain === undefined) {
      delete process.env.IMAGE_PROVIDER_CHAIN;
    } else {
      process.env.IMAGE_PROVIDER_CHAIN = originalChain;
    }
    if (originalGemini === undefined) {
      delete process.env.GEMINI_IMAGE_ENABLED;
    } else {
      process.env.GEMINI_IMAGE_ENABLED = originalGemini;
    }
  });

  it("defaults IMAGE_PROVIDER_CHAIN to cloudflare:@cf/black-forest-labs/flux-2-klein-4b,local:fastsd,pixabay (M4.1)", () => {
    delete process.env.IMAGE_PROVIDER_CHAIN;
    const cfg = getProviderChainConfig();
    expect(cfg.chain).toEqual([
      { provider: "cloudflare", model: "@cf/black-forest-labs/flux-2-klein-4b" },
      { provider: "local", model: "fastsd" },
      { provider: "pixabay", model: "default" },
    ]);
  });

  it("builds FormData multipart for flux-2-klein-4b and prompt-only JSON for flux-1-schnell (R3-10)", () => {
    const klein = buildCloudflareRequestPayload({
      model: "@cf/black-forest-labs/flux-2-klein-4b",
      prompt: "watch gears",
      width: 720,
      height: 1280,
    });
    expect(klein.body).toBeInstanceOf(FormData);
    expect(klein.contentType).toBeUndefined();
    expect((klein.body as FormData).get("width")).toBe("720");
    expect((klein.body as FormData).get("height")).toBe("1280");

    const schnell = buildCloudflareRequestPayload({
      model: "@cf/black-forest-labs/flux-1-schnell",
      prompt: "watch gears",
      width: 720,
      height: 1280,
    });
    expect(typeof schnell.body).toBe("string");
    expect(JSON.parse(schnell.body as string)).toEqual({ prompt: "watch gears" });
  });

  it("parses custom provider chain and geminiImageEnabled flag", () => {
    process.env.IMAGE_PROVIDER_CHAIN =
      "cloudflare:@cf/leonardo/lucid-origin, pollinations:flux";
    process.env.GEMINI_IMAGE_ENABLED = "true";

    const cfg = getProviderChainConfig();
    expect(cfg.chain).toEqual([
      { provider: "cloudflare", model: "@cf/leonardo/lucid-origin" },
      { provider: "pollinations", model: "flux" },
    ]);
    expect(cfg.geminiImageEnabled).toBe(true);
  });
});

describe("PollinationsAdaptiveThrottle (P1-5)", () => {
  it("does not backoff on 402 and skips Pollinations for rest of run after 3x 402", () => {
    const throttle = new PollinationsAdaptiveThrottle(6000);
    expect(throttle.onPaymentRequired402()).toEqual({
      count: 1,
      skippedForRun: false,
    });
    expect(throttle.onPaymentRequired402()).toEqual({
      count: 2,
      skippedForRun: false,
    });
    expect(throttle.onPaymentRequired402()).toEqual({
      count: 3,
      skippedForRun: true,
    });
    expect(throttle.getIntervalMs()).toBe(6000);
    expect(throttle.backoffTriggered).toBe(false);
    expect(throttle.skippedForRun).toBe(true);
  });

  it("applies 1.5x backoff only on 429 rate limits", () => {
    const throttle = new PollinationsAdaptiveThrottle(6000);
    expect(throttle.onRateLimit429()).toBe(9000);
    expect(throttle.backoffTriggered).toBe(true);
    expect(throttle.skippedForRun).toBe(false);
  });

  it("orders sticky provider first when stickyProvider is locked (R3-3)", () => {
    const chain = [
      { provider: "pollinations", model: "flux" },
      { provider: "cloudflare", model: "@cf/leonardo/lucid-origin" },
      { provider: "pixabay", model: "default" },
    ];
    expect(orderChainWithStickyProvider(chain, "cloudflare").map((c) => c.provider)).toEqual([
      "cloudflare",
      "pollinations",
      "pixabay",
    ]);
  });
});
