import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLOUDFLARE_DAILY_NEURON_LIMIT,
  CLOUDFLARE_NEURON_RATES,
  estimateCloudflareNeurons,
  estimateRunNeuronNeed,
  isProviderExhausted,
  markProviderExhausted,
  resetExhaustedProviders,
} from "@core/assets/quota";

describe("Cloudflare neuron quota estimation (R3-11)", () => {
  it("keeps official rates in CLOUDFLARE_NEURON_RATES", () => {
    expect(CLOUDFLARE_NEURON_RATES["@cf/black-forest-labs/flux-2-klein-4b"]).toBeDefined();
    expect(CLOUDFLARE_NEURON_RATES["@cf/leonardo/lucid-origin"]).toBeDefined();
    expect(CLOUDFLARE_DAILY_NEURON_LIMIT).toBe(10_000);
  });

  it("estimates ~156 neurons for flux-2-klein-4b 720x1280 (6 tiles) and ~57 for flux-1-schnell", () => {
    expect(
      estimateCloudflareNeurons({
        model: "@cf/black-forest-labs/flux-2-klein-4b",
        width: 720,
        height: 1280,
      })
    ).toBe(156);

    expect(
      estimateCloudflareNeurons({
        model: "@cf/black-forest-labs/flux-1-schnell",
        width: 720,
        height: 1280,
      })
    ).toBe(57);

    expect(
      estimateCloudflareNeurons({
        model: "@cf/leonardo/lucid-origin",
        width: 720,
        height: 1280,
      })
    ).toBeGreaterThan(3800);
  });

  it("computes beatCount * 1.3 * neuronsPerImage for pre-run check", () => {
    const need = estimateRunNeuronNeed(10, "@cf/black-forest-labs/flux-2-klein-4b");
    expect(need).toBe(Math.round(10 * 1.3 * 156));
  });
});

describe("Cloudflare 60-minute probe cooldown & reset (M1)", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await resetExhaustedProviders();
  });

  it("sets cloudflare exhausted_until to +60 minutes and clears after 60m + 1s", async () => {
    vi.useFakeTimers();
    const baseTime = new Date("2026-11-17T12:00:00.000Z");
    vi.setSystemTime(baseTime);

    await markProviderExhausted("cloudflare");
    expect(await isProviderExhausted("cloudflare")).toBe(true);

    // 59 menit kemudian: masih dianggap exhausted
    vi.setSystemTime(new Date(baseTime.getTime() + 59 * 60 * 1000));
    expect(await isProviderExhausted("cloudflare")).toBe(true);

    // 60 menit + 1 detik kemudian: siap di-probe ulang
    vi.setSystemTime(new Date(baseTime.getTime() + 60 * 60 * 1000 + 1000));
    expect(await isProviderExhausted("cloudflare")).toBe(false);
  });

  it("clears all exhausted_until via resetExhaustedProviders", async () => {
    await markProviderExhausted("cloudflare");
    expect(await isProviderExhausted("cloudflare")).toBe(true);

    const cleared = await resetExhaustedProviders();
    expect(cleared.exhausted_until).toEqual({});
    expect(await isProviderExhausted("cloudflare")).toBe(false);
  });
});
