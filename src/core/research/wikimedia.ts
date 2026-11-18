import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import {
  checkCommonsLicense,
  downloadCommonsAssetToCache,
  extractCommonsFileNameFromUrl,
  getWikimediaHeaders,
  searchCommonsFiles,
  type ArchivalAsset,
} from "@core/research/commons";

export interface WikimediaResearchPackage {
  source_type: "wikipedia_onthisday";
  date: string;
  lang: string;
  event: { year: number; text: string };
  claims: Array<{ ref_id: string; text: string; url: string }>;
  assets: Array<{
    asset_id: string;
    title: string;
    description: string;
    credit: string;
    local_file_path: string;
    width?: number;
    height?: number;
  }>;
  person_names: string[];
}

export interface WikimediaPageSummary {
  title: string;
  extract?: string;
  thumbnail?: { source?: string; width?: number; height?: number };
  originalimage?: { source?: string; width?: number; height?: number };
  content_urls?: { desktop?: { page?: string } };
}

export interface WikimediaOnThisDayItem {
  text: string;
  year: number;
  pages: WikimediaPageSummary[];
  isSelected?: boolean;
  score?: number;
}

const WIKI_CACHE_DIR = path.join(
  process.cwd(),
  "public",
  "storyboard",
  "cache",
  "wikimedia"
);
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function readWikiCache(key: string): Promise<unknown | null> {
  try {
    const file = path.join(WIKI_CACHE_DIR, `${key}.json`);
    const st = await stat(file);
    if (Date.now() - st.mtimeMs > SEVEN_DAYS_MS) return null;
    return JSON.parse(await readFile(file, "utf-8"));
  } catch {
    return null;
  }
}

async function writeWikiCache(key: string, data: unknown): Promise<void> {
  try {
    await mkdir(WIKI_CACHE_DIR, { recursive: true });
    await writeFile(
      path.join(WIKI_CACHE_DIR, `${key}.json`),
      JSON.stringify(data),
      "utf-8"
    );
  } catch {
    // ignore cache write failures
  }
}

/**
 * Mengambil feed OnThisDay untuk `mm/dd` dengan urutan bahasa `WIKI_LANGS` (default `id,en`),
 * fallback ke `api.wikimedia.org`, dan cache 7 hari (M4.2).
 */
export async function fetchOnThisDay(
  mm: string,
  dd: string,
  langOverride?: string
): Promise<{
  lang: string;
  selected: WikimediaOnThisDayItem[];
  events: WikimediaOnThisDayItem[];
}> {
  const mm2 = mm.padStart(2, "0");
  const dd2 = dd.padStart(2, "0");
  const langs = langOverride
    ? [langOverride]
    : (process.env.WIKI_LANGS || "id,en")
        .split(",")
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean);

  for (const lang of langs) {
    const cacheKey = `${lang}-${mm2}-${dd2}`;
    const cached = (await readWikiCache(cacheKey)) as {
      selected?: WikimediaOnThisDayItem[];
      events?: WikimediaOnThisDayItem[];
    } | null;

    if (cached) {
      const count = (cached.selected?.length || 0) + (cached.events?.length || 0);
      if (count >= 5) {
        return {
          lang,
          selected: cached.selected || [],
          events: cached.events || [],
        };
      }
    }

    const endpoints = [
      `https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm2}/${dd2}`,
      `https://api.wikimedia.org/feed/v1/wikipedia/${lang}/onthisday/all/${mm2}/${dd2}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: getWikimediaHeaders(),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as {
          selected?: WikimediaOnThisDayItem[];
          events?: WikimediaOnThisDayItem[];
        };
        const selected = Array.isArray(json?.selected) ? json.selected : [];
        const events = Array.isArray(json?.events) ? json.events : [];
        if (selected.length + events.length >= 5) {
          await writeWikiCache(cacheKey, { selected, events });
          return { lang, selected, events };
        }
      } catch {
        // coba endpoint berikutnya
      }
    }
  }

  throw new Error(
    `Wikimedia OnThisDay tidak mengembalikan >= 5 item untuk ${mm2}-${dd2} (${langs.join(",")}).`
  );
}

/**
 * Memilih maksimal 8 kandidat terbaik dari `selected` lalu `events` (M4.2).
 */
export function selectOnThisDayCandidates(
  feed: {
    selected: WikimediaOnThisDayItem[];
    events: WikimediaOnThisDayItem[];
  },
  topicKeyword = ""
): WikimediaOnThisDayItem[] {
  const kwLower = topicKeyword.trim().toLowerCase();
  const combined: WikimediaOnThisDayItem[] = [
    ...(feed.selected || []).map((it) => ({ ...it, isSelected: true })),
    ...(feed.events || []).map((it) => ({ ...it, isSelected: false })),
  ];

  const valid = combined.filter(
    (item) =>
      Array.isArray(item.pages) &&
      item.pages.some((p) => Boolean(p.extract && p.extract.trim()))
  );

  const scored = valid.map((item) => {
    const hasImage = item.pages.some(
      (p) => Boolean(p.originalimage?.source || p.thumbnail?.source)
    );
    let score = 0;
    if (hasImage) score += 2;
    if (item.isSelected) score += 2;
    if (Number(item.year) >= 1800) score += 1;
    if (kwLower && item.text.toLowerCase().includes(kwLower)) score += 3;
    return { ...item, score };
  });

  scored.sort((a, b) => (b.score || 0) - (a.score || 0));
  return scored.slice(0, 8);
}

/**
 * Menyusun `research_package` lengkap (ringkasan halaman + aset Commons tervalidasi lisensi).
 */
export async function buildResearchPackage(params: {
  candidate: WikimediaOnThisDayItem;
  lang: string;
  mm: string;
  dd: string;
}): Promise<WikimediaResearchPackage> {
  const { candidate, lang, mm, dd } = params;
  const mmDd = `${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  const pages = (candidate.pages || []).slice(0, 3);

  const claims: Array<{ ref_id: string; text: string; url: string }> = [];
  const assets: ArchivalAsset[] = [];
  const personNames: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    let extract = p.extract || "";
    let pageUrl = p.content_urls?.desktop?.page || "";
    let imageSource = p.originalimage?.source || p.thumbnail?.source || "";

    if (p.title) {
      personNames.push(p.title);
      try {
        const sumRes = await fetch(
          `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            p.title
          )}`,
          {
            headers: getWikimediaHeaders(),
            signal: AbortSignal.timeout(12000),
          }
        );
        if (sumRes.ok) {
          const sumJson = (await sumRes.json()) as WikimediaPageSummary;
          if (sumJson.extract) extract = sumJson.extract;
          if (sumJson.content_urls?.desktop?.page) {
            pageUrl = sumJson.content_urls.desktop.page;
          }
          if (!imageSource) {
            imageSource =
              sumJson.originalimage?.source || sumJson.thumbnail?.source || "";
          }
        }
      } catch {
        // gunakan data dari feed
      }
    }

    if (extract) {
      claims.push({
        ref_id: `W${claims.length + 1}`,
        text: extract,
        url: pageUrl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
      });
    }

    if (imageSource && assets.length < 6) {
      const fileName = extractCommonsFileNameFromUrl(imageSource);
      if (fileName) {
        const check = await checkCommonsLicense(fileName);
        if (check.allowed) {
          const downloaded = await downloadCommonsAssetToCache({
            assetId: `A${assets.length + 1}`,
            check,
            description: `${p.title}: ${extract.slice(0, 140)}`,
          });
          if (downloaded) assets.push(downloaded);
        }
      }
    }
  }

  // Tambahan pencarian Commons maksimal 2 file jika aset masih sedikit
  if (assets.length < 2 && pages[0]?.title) {
    const extraFiles = await searchCommonsFiles(pages[0].title, 2);
    for (const fileTitle of extraFiles) {
      if (assets.length >= 6) break;
      const check = await checkCommonsLicense(fileTitle);
      if (check.allowed) {
        const downloaded = await downloadCommonsAssetToCache({
          assetId: `A${assets.length + 1}`,
          check,
          description: `${pages[0].title} archival image`,
        });
        if (downloaded) assets.push(downloaded);
      }
    }
  }

  return {
    source_type: "wikipedia_onthisday",
    date: mmDd,
    lang,
    event: {
      year: Number(candidate.year) || 0,
      text: candidate.text,
    },
    claims,
    assets: assets.map((a) => ({
      asset_id: a.asset_id,
      title: a.title,
      description: a.description,
      credit: a.credit,
      local_file_path: a.local_file_path,
      width: a.width,
      height: a.height,
    })),
    person_names: personNames,
  };
}
