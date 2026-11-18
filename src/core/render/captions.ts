import type { WordTiming } from "@core/audio/tts";

export interface CleanCaptionItem {
  start_sec: number;
  end_sec: number;
  lines: string[];
}

function round3(n: number): number {
  return Number(n.toFixed(3));
}

function wrapToTwoLines(words: string[], maxCharsPerLine: number): string[] {
  const full = words.join(" ");
  if (full.length <= maxCharsPerLine) return [full];

  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxCharsPerLine) {
      current = `${current} ${w}`;
    } else {
      lines.push(current);
      current = w;
      if (lines.length === 1) {
        const rest = words.slice(i).join(" ");
        lines.push(rest);
        return lines;
      }
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

/**
 * Membangun caption "kalimat bersih" (M5.2):
 * - Pecah di tanda baca, batasi 1-2 baris <= `maxCharsPerLine` (default 26).
 * - Tampil dari kata pertama s/d kata terakhir + 0.15s; celah < 0.3s diperpanjang.
 * - Hindari baris yatim 1 kata bila masih bisa digabung.
 */
export function buildCleanCaptions(
  words: readonly WordTiming[],
  maxCharsPerLine = 26
): CleanCaptionItem[] {
  if (!Array.isArray(words) || words.length === 0) return [];
  const maxTotalChars = maxCharsPerLine * 2;

  const groups: WordTiming[][] = [];
  let currentGroup: WordTiming[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const nextText = [...currentGroup.map((x) => x.text), w.text].join(" ");
    if (currentGroup.length > 0 && nextText.length > maxTotalChars) {
      groups.push(currentGroup);
      currentGroup = [w];
    } else {
      currentGroup.push(w);
    }

    if (/[.!?,;:]$/.test(w.text) && currentGroup.length >= 2) {
      groups.push(currentGroup);
      currentGroup = [];
    }
  }
  if (currentGroup.length > 0) {
    if (
      currentGroup.length === 1 &&
      groups.length > 0 &&
      [...groups[groups.length - 1], ...currentGroup]
        .map((x) => x.text)
        .join(" ").length <=
        maxTotalChars + 6
    ) {
      groups[groups.length - 1].push(...currentGroup);
    } else {
      groups.push(currentGroup);
    }
  }

  const captions: CleanCaptionItem[] = groups.map((g) => ({
    start_sec: round3(g[0].start),
    end_sec: round3(g[g.length - 1].end + 0.15),
    lines: wrapToTwoLines(
      g.map((x) => x.text),
      maxCharsPerLine
    ),
  }));

  // Perpanjang jika celah ke caption berikutnya < 0.3s (anti-kedip)
  for (let i = 0; i < captions.length - 1; i++) {
    const gap = captions[i + 1].start_sec - captions[i].end_sec;
    if (gap < 0.3) {
      captions[i].end_sec = Math.max(
        captions[i].start_sec,
        captions[i + 1].start_sec
      );
    }
  }

  return captions;
}
