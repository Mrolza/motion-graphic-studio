import { rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAssetCacheKey, lookupAssetCache, saveAssetCache } from "@core/assets/cache";

describe("Asset cache (copied from content-studio)", () => {
  const createdFiles: string[] = [];

  afterEach(() => {
    for (const f of createdFiles.splice(0)) {
      rmSync(f, { force: true });
    }
  });

  it("builds deterministic sha256 cache keys", () => {
    const k1 = buildAssetCacheKey({
      provider_id: "cloudflare",
      model: "flux-2-klein-4b",
      visual_prompt_en: "  blueprint train wheel  ",
      seed: 42,
      width: 720,
      height: 1280,
    });
    const k2 = buildAssetCacheKey({
      provider_id: "cloudflare",
      model: "flux-2-klein-4b",
      visual_prompt_en: "blueprint train wheel",
      seed: 42,
      width: 720,
      height: 1280,
    });
    expect(k1).toBe(k2);
    expect(k1).toHaveLength(64);
  });

  it("saves and looks up a cached image buffer", async () => {
    const hash = buildAssetCacheKey({
      provider_id: "test",
      model: "unit",
      visual_prompt_en: `test-cache-${Date.now()}`,
      seed: 1,
      width: 720,
      height: 1280,
    });
    const entry = await saveAssetCache({
      hash,
      buffer: Buffer.alloc(1500, 1),
      ext: "png",
      media_type: "image",
      provider_id: "test",
      model: "unit",
    });
    createdFiles.push(path.join(process.cwd(), "public", entry.media_url.replace(/^\//, "")));

    const found = await lookupAssetCache(hash);
    expect(found).not.toBeNull();
    expect(found?.provider_id).toBe("test");
  });
});
