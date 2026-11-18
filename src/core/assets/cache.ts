import crypto from "crypto";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";

export interface CachedAlignmentInfo {
  score: number;
  missing: string[];
  wrong_elements: string[];
  has_text_artifacts: boolean;
}

export interface CacheIndexEntry {
  hash: string;
  media_url: string;
  local_file_path: string;
  media_type: "image" | "video";
  provider_id: string;
  model: string;
  alignment?: CachedAlignmentInfo;
  created_at: string;
  last_used_at: string;
}

const CACHE_DIR = path.join(process.cwd(), "public", "storyboard", "cache");
const CACHE_INDEX_PATH = path.join(CACHE_DIR, "cache-index.json");
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

let cleanupTriggered = false;

export function buildAssetCacheKey(params: {
  provider_id: string;
  model: string;
  visual_prompt_en: string;
  seed: number;
  width: number;
  height: number;
}): string {
  const payload = [
    params.provider_id,
    params.model,
    params.visual_prompt_en.trim(),
    String(params.seed),
    String(params.width),
    String(params.height),
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function readCacheIndex(): Promise<Record<string, CacheIndexEntry>> {
  try {
    const raw = await readFile(CACHE_INDEX_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCacheIndex(
  index: Record<string, CacheIndexEntry>
): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
}

/**
 * Hapus file cache > 14 hari yang tidak dipakai oleh latest-session.json (dijalankan sekali saat server start).
 */
export async function triggerCacheCleanupOnce(): Promise<void> {
  if (cleanupTriggered) return;
  cleanupTriggered = true;

  try {
    const index = await readCacheIndex();
    const entries = Object.values(index);
    if (entries.length === 0) return;

    // Kumpulkan path media yang masih dipakai di latest-session.json
    const activeUrls = new Set<string>();
    try {
      const latestRaw = await readFile(
        path.join(process.cwd(), "public", "storyboard", "latest-session.json"),
        "utf-8"
      );
      const latestJson = JSON.parse(latestRaw) as {
        directorOutput?: { storyboard_scenes?: Array<{ media_url?: string }> };
      };
      for (const s of latestJson.directorOutput?.storyboard_scenes || []) {
        if (s.media_url) activeUrls.add(s.media_url);
      }
    } catch {
      // Abaikan jika latest-session.json belum ada
    }

    const now = Date.now();
    let changed = false;

    for (const entry of entries) {
      if (activeUrls.has(entry.media_url)) continue;
      const lastUsed = Date.parse(entry.last_used_at || entry.created_at);
      if (Number.isFinite(lastUsed) && now - lastUsed > FOURTEEN_DAYS_MS) {
        try {
          await rm(path.join(process.cwd(), entry.local_file_path), {
            force: true,
          });
        } catch {
          // Ignore file delete error
        }
        delete index[entry.hash];
        changed = true;
      }
    }

    if (changed) {
      await writeCacheIndex(index);
    }
  } catch {
    // Non-blocking cleanup
  }
}

export async function lookupAssetCache(
  hash: string
): Promise<CacheIndexEntry | null> {
  void triggerCacheCleanupOnce();
  const index = await readCacheIndex();
  const entry = index[hash];
  if (!entry) return null;

  const absPath = path.join(process.cwd(), entry.local_file_path);
  try {
    const st = await stat(absPath);
    if (!st.isFile() || st.size < 1000) return null;
    entry.last_used_at = new Date().toISOString();
    index[hash] = entry;
    await writeCacheIndex(index);
    return entry;
  } catch {
    return null;
  }
}

export async function saveAssetCache(params: {
  hash: string;
  buffer: Buffer;
  ext: "jpg" | "png" | "mp4";
  media_type: "image" | "video";
  provider_id: string;
  model: string;
  alignment?: CachedAlignmentInfo;
}): Promise<CacheIndexEntry> {
  await mkdir(CACHE_DIR, { recursive: true });
  const fileName = `${params.hash}.${params.ext}`;
  const relPath = `public/storyboard/cache/${fileName}`;
  const mediaUrl = `/storyboard/cache/${fileName}`;
  await writeFile(path.join(process.cwd(), relPath), params.buffer);

  const nowIso = new Date().toISOString();
  const entry: CacheIndexEntry = {
    hash: params.hash,
    media_url: mediaUrl,
    local_file_path: relPath,
    media_type: params.media_type,
    provider_id: params.provider_id,
    model: params.model,
    alignment: params.alignment,
    created_at: nowIso,
    last_used_at: nowIso,
  };

  const index = await readCacheIndex();
  index[params.hash] = entry;
  await writeCacheIndex(index);
  return entry;
}

export async function updateCacheAlignment(
  hash: string,
  alignment: CachedAlignmentInfo
): Promise<void> {
  const index = await readCacheIndex();
  if (!index[hash]) return;
  index[hash].alignment = alignment;
  index[hash].last_used_at = new Date().toISOString();
  await writeCacheIndex(index);
}
