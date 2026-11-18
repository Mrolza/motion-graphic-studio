import { buildAssetCacheKey, lookupAssetCache, saveAssetCache } from "@core/assets/cache";

export interface CommonsImageCheckResult {
  allowed: boolean;
  reason?: string;
  title: string;
  licenseShortName?: string;
  artist?: string;
  credit?: string;
  downloadUrl?: string;
  width?: number;
  height?: number;
}

export interface ArchivalAsset {
  asset_id: string;
  title: string;
  description: string;
  credit: string;
  license: string;
  local_file_path: string;
  media_url: string;
  width?: number;
  height?: number;
}

export function getWikimediaHeaders(): Record<string, string> {
  const contact = (process.env.WIKIMEDIA_UA_CONTACT || "").trim();
  const ua = contact
    ? `ContentStudio/1.0 (personal project; ${contact})`
    : `ContentStudio/1.0 (personal project)`;
  return {
    "User-Agent": ua,
    Accept: "application/json",
  };
}

/**
 * Menghapus tag HTML dari metadata Artist Wikimedia Commons.
 */
export function stripHtmlTags(raw: string): string {
  return (raw || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Memeriksa apakah `LicenseShortName` termasuk lisensi bebas yang diizinkan (M4.3):
 * Public domain, PD-*, CC0, CC BY *, CC BY-SA *.
 */
export function isAllowedCommonsLicense(licenseShortName: string): boolean {
  const lic = (licenseShortName || "").trim();
  if (!lic) return false;
  if (/^public\s+domain$/i.test(lic)) return true;
  if (/^pd[-_ ]/i.test(lic) || /^pd$/i.test(lic)) return true;
  if (/^cc0(\b|[- ])/i.test(lic)) return true;
  if (/^cc[- ]by([- ]sa)?(\b|[- ]|\s+\d)/i.test(lic)) return true;
  return false;
}

export function formatCommonsCredit(
  rawArtist: string | undefined,
  licenseShortName: string
): string {
  const cleanArtist = stripHtmlTags(rawArtist || "") || "Unknown";
  return `Foto: ${cleanArtist} / Wikimedia Commons, ${licenseShortName}`;
}

export function extractCommonsFileNameFromUrl(url: string): string | null {
  try {
    const clean = url.split("?")[0];
    const parts = clean.split("/").filter(Boolean);
    const last = decodeURIComponent(parts[parts.length - 1] || "");
    if (!last) return null;
    // Thumbnail URLs look like .../thumb/.../File.jpg/800px-File.jpg
    const thumbMatch = clean.match(/\/thumb\/[^/]+\/[^/]+\/([^/]+)\/\d+px-/);
    if (thumbMatch && thumbMatch[1]) {
      return decodeURIComponent(thumbMatch[1]);
    }
    return last.replace(/^\d+px-/, "");
  } catch {
    return null;
  }
}

/**
 * Mengecek lisensi file di Wikimedia Commons API. File lokal Wikipedia (tidak ada di Commons)
 * atau file berlisensi non-free/fair-use ditolak.
 */
export async function checkCommonsLicense(
  fileName: string
): Promise<CommonsImageCheckResult> {
  const normalizedTitle = fileName.startsWith("File:")
    ? fileName
    : `File:${fileName}`;
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1080&titles=${encodeURIComponent(
    normalizedTitle
  )}`;

  const res = await fetch(url, {
    headers: getWikimediaHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    return {
      allowed: false,
      reason: `Commons HTTP ${res.status}`,
      title: normalizedTitle,
    };
  }

  const json = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          missing?: string;
          imagerepository?: string;
          imageinfo?: Array<{
            url?: string;
            thumburl?: string;
            width?: number;
            height?: number;
            thumbwidth?: number;
            thumbheight?: number;
            extmetadata?: {
              LicenseShortName?: { value?: string };
              Artist?: { value?: string };
            };
          }>;
        }
      >;
    };
  };

  const pages = json?.query?.pages || {};
  const firstPage = Object.values(pages)[0];
  if (!firstPage || "missing" in firstPage || !firstPage.imageinfo?.[0]) {
    return {
      allowed: false,
      reason: "File tidak ditemukan di Wikimedia Commons (kemungkinan file lokal Wikipedia)",
      title: normalizedTitle,
    };
  }

  const info = firstPage.imageinfo[0];
  const licenseShortName = String(
    info.extmetadata?.LicenseShortName?.value || ""
  ).trim();
  if (!isAllowedCommonsLicense(licenseShortName)) {
    return {
      allowed: false,
      reason: `Lisensi ditolak: ${licenseShortName || "unknown"}`,
      title: normalizedTitle,
      licenseShortName,
    };
  }

  const rawArtist = String(info.extmetadata?.Artist?.value || "");
  const cleanArtist = stripHtmlTags(rawArtist) || "Unknown";
  const credit = formatCommonsCredit(rawArtist, licenseShortName);
  const downloadUrl = info.thumburl || info.url;
  if (!downloadUrl) {
    return {
      allowed: false,
      reason: "URL unduhan tidak tersedia",
      title: normalizedTitle,
    };
  }

  return {
    allowed: true,
    title: normalizedTitle,
    licenseShortName,
    artist: cleanArtist,
    credit,
    downloadUrl,
    width: info.thumbwidth || info.width,
    height: info.thumbheight || info.height,
  };
}

/**
 * Mengunduh gambar Commons lebar 1080px ke cache aset lokal.
 */
export async function downloadCommonsAssetToCache(params: {
  assetId: string;
  check: CommonsImageCheckResult;
  description: string;
}): Promise<ArchivalAsset | null> {
  if (!params.check.allowed || !params.check.downloadUrl) return null;

  const cacheKey = buildAssetCacheKey({
    provider_id: "wikimedia_commons",
    model: "archival_1080",
    visual_prompt_en: params.check.downloadUrl,
    seed: 0,
    width: params.check.width || 1080,
    height: params.check.height || 1080,
  });

  const cached = await lookupAssetCache(cacheKey);
  if (cached) {
    return {
      asset_id: params.assetId,
      title: params.check.title,
      description: params.description,
      credit: params.check.credit || "",
      license: params.check.licenseShortName || "",
      local_file_path: cached.local_file_path,
      media_url: cached.media_url,
      width: params.check.width,
      height: params.check.height,
    };
  }

  const res = await fetch(params.check.downloadUrl, {
    headers: {
      "User-Agent": getWikimediaHeaders()["User-Agent"],
      Accept: "image/*",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 3000) return null;

  const ext: "jpg" | "png" = ct.includes("png") ? "png" : "jpg";
  const saved = await saveAssetCache({
    hash: cacheKey,
    buffer: buf,
    ext,
    media_type: "image",
    provider_id: "wikimedia_commons",
    model: "archival_1080",
  });

  return {
    asset_id: params.assetId,
    title: params.check.title,
    description: params.description,
    credit: params.check.credit || "",
    license: params.check.licenseShortName || "",
    local_file_path: saved.local_file_path,
    media_url: saved.media_url,
    width: params.check.width,
    height: params.check.height,
  };
}

/**
 * Mencari tambahan file di Wikimedia Commons (`list=search&srnamespace=6`).
 */
export async function searchCommonsFiles(
  keyword: string,
  limit = 2
): Promise<string[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=${limit}&srsearch=${encodeURIComponent(
    keyword
  )}`;
  try {
    const res = await fetch(url, {
      headers: getWikimediaHeaders(),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    return (json?.query?.search || [])
      .map((s) => String(s.title || "").trim())
      .filter((t) => /\.(jpe?g|png|webp)$/i.test(t));
  } catch {
    return [];
  }
}
