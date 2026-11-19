import { getWikimediaHeaders } from '@core/research/commons';
import {
  fetchOnThisDay,
  selectOnThisDayCandidates,
} from '@core/research/wikimedia';

export interface WikipediaSource {
  source_id: string;
  url: string;
  title: string;
  lang: 'id' | 'en';
  text: string;
  retrieved_at: string;
}

const MAX_PAGE_CHARS = 30_000;

export function truncateWikiExtract(fullText: string, keywords: string[], maxChars = MAX_PAGE_CHARS): string {
  const clean = fullText.trim();
  if (clean.length <= maxChars) return clean;

  const introBudget = Math.floor(maxChars * 0.45);
  const intro = clean.slice(0, introBudget);
  const rest = clean.slice(introBudget);
  const sections = rest.split(/\n(?===\s)/);

  const lowerKw = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  const scored = sections.map((sec, idx) => {
    const lower = sec.toLowerCase();
    const hits = lowerKw.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
    return { sec, idx, hits };
  });
  scored.sort((a, b) => b.hits - a.hits || a.idx - b.idx);

  let used = intro.length;
  const picked: Array<{ idx: number; sec: string }> = [];
  for (const item of scored) {
    if (used + item.sec.length + 2 > maxChars) {
      const rem = maxChars - used - 2;
      if (rem > 400) {
        picked.push({ idx: item.idx, sec: item.sec.slice(0, rem) });
      }
      break;
    }
    picked.push({ idx: item.idx, sec: item.sec });
    used += item.sec.length + 2;
  }

  picked.sort((a, b) => a.idx - b.idx);
  return [intro, ...picked.map((p) => p.sec)].join('\n\n').slice(0, maxChars);
}

async function searchWikipediaTitles(lang: 'id' | 'en', query: string, limit = 3): Promise<string[]> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&srlimit=${limit}&format=json`;
  try {
    const res = await fetch(url, {
      headers: getWikimediaHeaders(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    return (data.query?.search ?? []).map((s) => s.title ?? '').filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchWikipediaExtract(
  lang: 'id' | 'en',
  title: string,
  keywords: string[]
): Promise<{ title: string; url: string; text: string } | null> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts|info&inprop=url&explaintext=1&redirects=1&titles=${encodeURIComponent(
    title
  )}&format=json`;
  try {
    const res = await fetch(url, {
      headers: getWikimediaHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: {
        pages?: Record<string, { title?: string; fullurl?: string; extract?: string; missing?: string }>;
      };
    };
    const pages = Object.values(data.query?.pages ?? {});
    const page = pages[0];
    if (!page || page.missing !== undefined || !page.extract || page.extract.trim().length < 100) {
      return null;
    }
    const finalTitle = page.title || title;
    const finalUrl =
      page.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(finalTitle.replace(/ /g, '_'))}`;
    return {
      title: finalTitle,
      url: finalUrl,
      text: truncateWikiExtract(page.extract, keywords),
    };
  } catch {
    return null;
  }
}

export async function fetchWikipediaSourcesForConcept(params: {
  wikiTitles?: { en?: string[]; id?: string[] };
  queries: string[];
  keywords: string[];
  preferEnglishFirst?: boolean;
  maxPages?: number;
  startIndex?: number;
}): Promise<WikipediaSource[]> {
  const maxPages = params.maxPages ?? 4;
  const startIndex = params.startIndex ?? 0;
  const preferEn = params.preferEnglishFirst ?? true;
  const langOrder: Array<'en' | 'id'> = preferEn ? ['en', 'id'] : ['id', 'en'];
  const seen = new Set<string>();
  const sources: WikipediaSource[] = [];

  const tryAddTitle = async (lang: 'en' | 'id', title: string) => {
    if (sources.length >= maxPages) return;
    const key = `${lang}:${title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    const extracted = await fetchWikipediaExtract(lang, title, params.keywords);
    if (extracted) {
      const canonicalKey = `${lang}:${extracted.title.toLowerCase()}`;
      if (sources.some((s) => `${s.lang}:${s.title.toLowerCase()}` === canonicalKey)) return;
      seen.add(canonicalKey);
      sources.push({
        source_id: `S${startIndex + sources.length + 1}`,
        url: extracted.url,
        title: extracted.title,
        lang,
        text: extracted.text,
        retrieved_at: new Date().toISOString(),
      });
    }
  };

  // 1. Fetch by explicit wiki_titles first (following redirects)
  for (const lang of langOrder) {
    const titles = params.wikiTitles?.[lang] ?? [];
    for (const title of titles) {
      if (sources.length >= maxPages) break;
      await tryAddTitle(lang, title);
    }
  }

  // 2. Fallback to free search if still under maxPages
  for (const query of params.queries) {
    if (sources.length >= maxPages) break;
    for (const lang of langOrder) {
      if (sources.length >= maxPages) break;
      const titles = await searchWikipediaTitles(lang, query, 2);
      for (const title of titles) {
        if (sources.length >= maxPages) break;
        await tryAddTitle(lang, title);
      }
    }
  }

  return sources;
}

export async function fetchTodayInHistorySources(
  mmDd: string,
  maxPages = 4,
  topicKeyword = ''
): Promise<{ eventText: string; eventYear: number; sources: WikipediaSource[] }> {
  const [mmRaw, ddRaw] = mmDd.split('-');
  const mm = (mmRaw || '07').padStart(2, '0');
  const dd = (ddRaw || '20').padStart(2, '0');

  const feed = await fetchOnThisDay(mm, dd);
  const candidates = selectOnThisDayCandidates(feed, '');
  const kwWords = topicKeyword
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  let top = candidates[0];
  if (kwWords.length > 0 && candidates.length > 0) {
    let bestScore = -1;
    for (const c of [...(feed.selected ?? []), ...(feed.events ?? [])]) {
      const hay = `${c.year} ${c.text} ${(c.pages ?? []).map((p) => p.title).join(' ')}`.toLowerCase();
      const hits = kwWords.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
      if (hits > bestScore && (c.pages?.length ?? 0) > 0) {
        bestScore = hits;
        top = c;
      }
    }
  }
  if (!top) {
    throw new Error(`No OnThisDay events found for ${mm}-${dd}`);
  }

  const lang: 'id' | 'en' = feed.lang === 'id' ? 'id' : 'en';
  const sources: WikipediaSource[] = [];
  const keywords = top.text.split(/\s+/).filter((w: string) => w.length > 3);

  for (const page of (top.pages ?? []).slice(0, maxPages)) {
    if (!page.title) continue;
    const extracted = await fetchWikipediaExtract(lang, page.title, keywords);
    if (extracted) {
      sources.push({
        source_id: `S${sources.length + 1}`,
        url: extracted.url,
        title: extracted.title,
        lang,
        text: extracted.text,
        retrieved_at: new Date().toISOString(),
      });
    }
  }

  return {
    eventText: `${top.year}: ${top.text}`,
    eventYear: Number(top.year) || 0,
    sources,
  };
}
