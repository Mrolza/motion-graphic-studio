import { allocateBeatDurations } from "@core/timeline/beats";
import type { WordTiming } from "@core/audio/tts";

export interface SceneAudioTimelineInput {
  scene_id: string;
  audio_path: string;
  duration_sec: number;
  words: WordTiming[];
}

export interface BeatTimelineInput {
  beat_id: string;
  scene_id: string;
  narration_fragment: string;
  asset_mode?: string;
  motion_graphic?: { type?: string } | null;
}

export interface TimelineEvent {
  type: "hook" | "scene_cut" | "mg_in" | "stat_count";
  at: number;
  dur?: number;
}

export interface Timeline {
  total_sec: number;
  scenes: { scene_id: string; start: number; end: number; audio_path: string }[];
  beats: { beat_id: string; scene_id: string; start: number; end: number }[];
  shots: {
    shot_id: string;
    beat_id: string;
    scene_id: string;
    start: number;
    end: number;
    reframe_index: number;
  }[];
  words: { text: string; start: number; end: number; scene_id: string }[];
  events: TimelineEvent[];
}

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function tokenizeFragment(fragment: string): string[] {
  return (fragment || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(normalizeToken)
    .filter(Boolean);
}

function round3(n: number): number {
  return Number(n.toFixed(3));
}

/**
 * Mencocokkan potongan `narration_fragment` ke urutan kata TTS scene secara berurutan.
 * Mengembalikan `[startRel, endRel]` relatif terhadap awal scene untuk tiap beat, atau `null` bila gagal.
 */
function matchFragmentsToSceneWords(
  fragments: string[],
  sceneWords: WordTiming[],
  sceneDurationSec: number
): Array<{ start: number; end: number }> | null {
  if (fragments.length === 0 || sceneWords.length === 0) return null;
  if (fragments.length === 1) {
    return [{ start: 0, end: sceneDurationSec }];
  }

  const normalizedWords = sceneWords.map((w) => ({
    ...w,
    norm: normalizeToken(w.text),
  }));

  const ranges: Array<{ wordStartIdx: number; wordEndIdx: number }> = [];
  let cursor = 0;

  for (const frag of fragments) {
    const tokens = tokenizeFragment(frag);
    if (tokens.length === 0) return null;

    let matchStart = -1;
    let wIdx = cursor;
    for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
      const target = tokens[tIdx];
      let found = -1;
      // Cari token di jendela terdekat
      const limit = Math.min(normalizedWords.length, wIdx + (tIdx === 0 ? 4 : 3));
      for (let k = wIdx; k < limit; k++) {
        if (normalizedWords[k].norm === target) {
          found = k;
          break;
        }
      }
      if (found === -1) return null;
      if (tIdx === 0) matchStart = found;
      wIdx = found + 1;
    }

    ranges.push({ wordStartIdx: matchStart, wordEndIdx: wIdx - 1 });
    cursor = wIdx;
  }

  // Konversi indeks kata ke jendela waktu rapat (tanpa celah) dari 0..sceneDurationSec
  const windows: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < ranges.length; i++) {
    const start =
      i === 0 ? 0 : round3(normalizedWords[ranges[i].wordStartIdx].start);
    const end =
      i === ranges.length - 1
        ? sceneDurationSec
        : round3(normalizedWords[ranges[i + 1].wordStartIdx].start);
    if (end <= start) return null;
    windows.push({ start, end });
  }
  return windows;
}

/**
 * Menggabungkan beat yang durasinya < 1.0s ke tetangganya agar tidak berkedip.
 */
function mergeShortBeats(
  beats: Array<{
    beat_id: string;
    scene_id: string;
    start: number;
    end: number;
    asset_mode?: string;
    motion_graphic?: { type?: string } | null;
  }>
) {
  if (beats.length <= 1) return beats;
  const result = beats.map((b) => ({ ...b }));
  let i = 0;
  while (i < result.length && result.length > 1) {
    const dur = result[i].end - result[i].start;
    if (dur < 1.0) {
      if (i > 0) {
        result[i - 1].end = result[i].end;
        result.splice(i, 1);
      } else {
        result[1].start = result[0].start;
        result.splice(0, 1);
      }
      continue;
    }
    i++;
  }
  return result;
}

/**
 * Membangun Timeline tunggal (M2.2) sebagai sumber waktu bersama untuk
 * caption, potongan beat, shot reframe, event SFX, dan audio mix.
 */
export function buildTimeline(input: {
  scenes: SceneAudioTimelineInput[];
  beats: BeatTimelineInput[];
  sceneGapSec?: number;
  maxShotSec: number;
}): Timeline {
  const sceneGapSec =
    typeof input.sceneGapSec === "number" && input.sceneGapSec >= 0
      ? input.sceneGapSec
      : 0.2;
  const maxShotSec = Math.max(0.5, Number(input.maxShotSec) || 3.0);

  const scenes: Timeline["scenes"] = [];
  const beats: Timeline["beats"] = [];
  const shots: Timeline["shots"] = [];
  const words: Timeline["words"] = [];
  const events: Timeline["events"] = [];

  let cursor = 0;

  for (let sIdx = 0; sIdx < input.scenes.length; sIdx++) {
    const s = input.scenes[sIdx];
    const dur = Math.max(0.5, Number(s.duration_sec) || 0.5);
    const sceneStart = round3(cursor);
    const sceneEnd = round3(sceneStart + dur);

    scenes.push({
      scene_id: s.scene_id,
      start: sceneStart,
      end: sceneEnd,
      audio_path: s.audio_path,
    });

    if (sIdx === 0) {
      events.push({ type: "hook", at: 0 });
    } else {
      events.push({ type: "scene_cut", at: sceneStart });
    }

    for (const w of s.words || []) {
      words.push({
        text: w.text,
        start: round3(sceneStart + w.start),
        end: round3(sceneStart + Math.max(w.start, w.end)),
        scene_id: s.scene_id,
      });
    }

    const sceneBeatsInput = input.beats.filter((b) => b.scene_id === s.scene_id);
    if (sceneBeatsInput.length > 0) {
      const fragments = sceneBeatsInput.map((b) => b.narration_fragment);
      const matched = matchFragmentsToSceneWords(fragments, s.words || [], dur);

      let relWindows: Array<{ start: number; end: number }>;
      if (matched) {
        relWindows = matched;
      } else {
        const durs = allocateBeatDurations(dur, fragments, Math.min(1.0, dur / fragments.length));
        let bCursor = 0;
        relWindows = durs.map((d, idx) => {
          const st = round3(bCursor);
          const en = idx === durs.length - 1 ? dur : round3(bCursor + d);
          bCursor += d;
          return { start: st, end: en };
        });
      }

      const mergedBeats = mergeShortBeats(
        sceneBeatsInput.map((b, idx) => ({
          beat_id: b.beat_id,
          scene_id: s.scene_id,
          start: round3(sceneStart + relWindows[idx].start),
          end: round3(sceneStart + relWindows[idx].end),
          asset_mode: b.asset_mode,
          motion_graphic: b.motion_graphic,
        }))
      );

      for (const mb of mergedBeats) {
        beats.push({
          beat_id: mb.beat_id,
          scene_id: mb.scene_id,
          start: mb.start,
          end: mb.end,
        });

        if (mb.asset_mode === "motion_graphic") {
          events.push({ type: "mg_in", at: mb.start });
          if (mb.motion_graphic?.type === "stat") {
            events.push({ type: "stat_count", at: mb.start, dur: 0.8 });
          }
        }

        const beatDur = round3(mb.end - mb.start);
        const shotCount = Math.max(1, Math.ceil(beatDur / maxShotSec));
        const shotSlice = beatDur / shotCount;
        for (let k = 0; k < shotCount; k++) {
          const shStart = round3(mb.start + k * shotSlice);
          const shEnd = k === shotCount - 1 ? mb.end : round3(mb.start + (k + 1) * shotSlice);
          shots.push({
            shot_id: `${mb.beat_id}_sh${k + 1}`,
            beat_id: mb.beat_id,
            scene_id: mb.scene_id,
            start: shStart,
            end: shEnd,
            reframe_index: k,
          });
        }
      }
    }

    cursor = sceneEnd + (sIdx < input.scenes.length - 1 ? sceneGapSec : 0);
  }

  const totalSec = scenes.length > 0 ? scenes[scenes.length - 1].end : 0;

  return {
    total_sec: totalSec,
    scenes,
    beats,
    shots,
    words,
    events,
  };
}
