import type { Script } from '@core/contracts/script';
import type { Timeline } from '@core/contracts/timeline';
type TimelineWord = Timeline['words'][number];
import { toIndonesianSpokenText } from '@core/stages/voice';

export interface CaptionWordToken {
  text: string;
  start_sec: number;
  end_sec: number;
}

export interface KineticCaptionChunk {
  id: string;
  scene_id: string;
  start_sec: number;
  end_sec: number;
  lines: string[];
  words: CaptionWordToken[];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function formatSrtTime(sec: number): string {
  const msTotal = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(msTotal / 3_600_000);
  const m = Math.floor((msTotal % 3_600_000) / 60_000);
  const s = Math.floor((msTotal % 60_000) / 1000);
  const ms = msTotal % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Aligns display words from script.json to spoken_text word timings in timeline.json.
 * Handles token count differences (e.g. "1:20" <-> "1 banding 20", "720°" <-> "720 derajat").
 */
export function alignDisplayWordsToTimeline(
  script: Script,
  timeline: Timeline
): CaptionWordToken[] & Array<CaptionWordToken & { scene_id: string }> {
  const out: Array<CaptionWordToken & { scene_id: string }> = [];

  for (const sc of script.scenes) {
    const tlWords = timeline.words.filter((w) => w.scene_id === sc.id);
    let cursor = 0;

    for (const sent of sc.sentences) {
      const displayTokens = sent.text.trim().split(/\s+/).filter(Boolean);
      for (const dTok of displayTokens) {
        const spokenEquiv = toIndonesianSpokenText(dTok).split(/\s+/).filter(Boolean);
        const takeCount = Math.max(1, spokenEquiv.length);
        const slice: TimelineWord[] = [];
        for (let k = 0; k < takeCount && cursor < tlWords.length; k++) {
          slice.push(tlWords[cursor]!);
          cursor++;
        }
        if (slice.length > 0) {
          out.push({
            scene_id: sc.id,
            text: dTok,
            start_sec: round3(slice[0]!.start),
            end_sec: round3(slice[slice.length - 1]!.end),
          });
        } else if (out.length > 0) {
          const prev = out[out.length - 1]!;
          out.push({
            scene_id: sc.id,
            text: dTok,
            start_sec: prev.end_sec,
            end_sec: round3(prev.end_sec + 0.15),
          });
        }
      }
    }
  }
  return out;
}

function splitTwoLines(words: CaptionWordToken[], maxCharsPerLine = 26): string[] {
  const full = words.map((w) => w.text).join(' ');
  if (full.length <= maxCharsPerLine || words.length <= 2) return [full];
  const mid = Math.ceil(words.length / 2);
  return [
    words.slice(0, mid).map((w) => w.text).join(' '),
    words.slice(mid).map((w) => w.text).join(' '),
  ];
}

/**
 * Builds 2–5 word kinetic caption chunks (max 2 lines) from script + timeline.
 */
export function buildKineticCaptions(
  script: Script,
  timeline: Timeline
): KineticCaptionChunk[] {
  const aligned = alignDisplayWordsToTimeline(script, timeline);
  const chunks: KineticCaptionChunk[] = [];
  let buf: Array<CaptionWordToken & { scene_id: string }> = [];
  let idx = 1;

  const flush = () => {
    if (buf.length === 0) return;
    chunks.push({
      id: `cap_${idx++}`,
      scene_id: buf[0]!.scene_id,
      start_sec: buf[0]!.start_sec,
      end_sec: buf[buf.length - 1]!.end_sec,
      lines: splitTwoLines(buf, 26),
      words: buf.map(({ text, start_sec, end_sec }) => ({ text, start_sec, end_sec })),
    });
    buf = [];
  };

  for (let i = 0; i < aligned.length; i++) {
    const w = aligned[i]!;
    if (buf.length > 0 && buf[0]!.scene_id !== w.scene_id) {
      flush();
    }
    buf.push(w);
    const endsPunct = /[.!?,;:]$/.test(w.text);
    const nextIsDifferentScene = i + 1 < aligned.length && aligned[i + 1]!.scene_id !== w.scene_id;
    const wouldOrphanLast =
      i + 2 === aligned.length || (i + 2 < aligned.length && aligned[i + 2]!.scene_id !== w.scene_id);
    if (buf.length >= 5 || (endsPunct && buf.length >= 2 && !wouldOrphanLast && !nextIsDifferentScene)) {
      flush();
    }
  }
  flush();

  // Merge single-word orphan chunk into previous chunk if <= 5 words
  for (let i = chunks.length - 1; i > 0; i--) {
    const cur = chunks[i]!;
    const prev = chunks[i - 1]!;
    if (cur.words.length === 1 && cur.scene_id === prev.scene_id && prev.words.length + 1 <= 5) {
      prev.words.push(...cur.words);
      prev.end_sec = cur.end_sec;
      prev.lines = splitTwoLines(prev.words, 26);
      chunks.splice(i, 1);
    }
  }

  return chunks;
}

export function captionsToSrt(chunks: readonly KineticCaptionChunk[]): string {
  return chunks
    .map(
      (c, idx) =>
        `${idx + 1}\n${formatSrtTime(c.start_sec)} --> ${formatSrtTime(c.end_sec)}\n${c.lines.join('\n')}`
    )
    .join('\n\n')
    .concat('\n');
}
