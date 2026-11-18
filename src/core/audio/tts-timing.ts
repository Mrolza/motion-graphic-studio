import { execFile } from "child_process";
import { mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

const execFileAsync = promisify(execFile);

export interface WordTiming {
  text: string;
  start: number;
  end: number;
}

export type TimingSource = "word_boundary" | "proportional_estimate";

export const TRIM_SILENCE_FILTER =
  "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse";

export async function probeMp3DurationSec(audioAbsPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(ffprobeInstaller.path, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      audioAbsPath,
    ]);
    const dur = Number(stdout.trim());
    return Number.isFinite(dur) && dur > 0 ? Number(dur.toFixed(3)) : 0;
  } catch {
    return 0;
  }
}

/**
 * Mengurai metadata WordBoundary dari `msedge-tts` (satuan 100 ns -> detik).
 */
export function parseMsEdgeWordBoundaries(metaJson: unknown): WordTiming[] {
  const rows = Array.isArray((metaJson as { Metadata?: unknown[] })?.Metadata)
    ? ((metaJson as { Metadata: Array<Record<string, unknown>> }).Metadata)
    : [];
  const words: WordTiming[] = [];
  for (const row of rows) {
    if (row?.Type !== "WordBoundary") continue;
    const data = row.Data as
      | { Offset?: number; Duration?: number; text?: { Text?: string } }
      | undefined;
    const text = String(data?.text?.Text || "").trim();
    const offsetTicks = Number(data?.Offset);
    const durTicks = Number(data?.Duration);
    if (!text || !Number.isFinite(offsetTicks) || !Number.isFinite(durTicks)) {
      continue;
    }
    const start = Number((offsetTicks / 1e7).toFixed(3));
    const end = Number(((offsetTicks + Math.max(0, durTicks)) / 1e7).toFixed(3));
    words.push({ text, start, end });
  }
  return words;
}

/**
 * Estimasi timing kata proporsional berbobot panjang kata + jeda tanda baca (M2.1 fallback).
 */
export function estimateWordTimingsProportional(
  text: string,
  durationSec: number
): WordTiming[] {
  const tokens = (text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (tokens.length === 0 || durationSec <= 0) return [];

  const weights = tokens.map((tok) => {
    const cleanLen = Math.max(1, tok.replace(/[^\p{L}\p{N}]/gu, "").length);
    let pause = 0;
    if (/[.!?]$/.test(tok)) pause = 2.5;
    else if (/[,;:]$/.test(tok)) pause = 1.2;
    return cleanLen + pause;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0) || tokens.length;
  const out: WordTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const share = (weights[i] / totalWeight) * durationSec;
    const start = Number(cursor.toFixed(3));
    const end =
      i === tokens.length - 1
        ? Number(durationSec.toFixed(3))
        : Number((cursor + share).toFixed(3));
    out.push({ text: tokens[i], start, end });
    cursor += share;
  }
  return out;
}

/**
 * Memotong hening awal/akhir berdasarkan WordBoundary (`lead = max(0, words[0].start - 0.05)`,
 * `end = words.at(-1).end + 0.15`) dan menggeser semua timing kata sebesar `-lead` (M2.1).
 */
export async function trimAudioWithWordBoundaries(
  audioAbsPath: string,
  words: WordTiming[]
): Promise<{ byteLength: number; durationSec: number; words: WordTiming[] }> {
  if (words.length === 0) {
    const byteLength = await trimAudioSilence(audioAbsPath);
    const durationSec = await probeMp3DurationSec(audioAbsPath);
    return { byteLength, durationSec, words: [] };
  }

  const lead = Math.max(0, Number((words[0].start - 0.05).toFixed(3)));
  const end = Number((words[words.length - 1].end + 0.15).toFixed(3));
  const tmpTrimPath = `${audioAbsPath}.wb.mp3`;

  try {
    await execFileAsync(ffmpegInstaller.path, [
      "-y",
      "-i",
      audioAbsPath,
      "-af",
      `atrim=start=${lead}:end=${end},asetpts=PTS-STARTPTS`,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      tmpTrimPath,
    ]);
    await rename(tmpTrimPath, audioAbsPath);
  } catch (err) {
    console.warn(
      `[VoiceOver] Gagal atrim word-boundary ${path.basename(audioAbsPath)}, fallback silenceremove:`,
      err instanceof Error ? err.message : String(err)
    );
    await rm(tmpTrimPath, { force: true }).catch(() => {});
    const byteLength = await trimAudioSilence(audioAbsPath);
    const durationSec = await probeMp3DurationSec(audioAbsPath);
    return {
      byteLength,
      durationSec,
      words: estimateWordTimingsProportional(
        words.map((w) => w.text).join(" "),
        durationSec
      ),
    };
  }

  const shiftedWords = words.map((w) => {
    const start = Math.max(0, Number((w.start - lead).toFixed(3)));
    const wEnd = Math.max(start, Number((w.end - lead).toFixed(3)));
    return { text: w.text, start, end: wEnd };
  });

  const st = await stat(audioAbsPath);
  const durationSec =
    (await probeMp3DurationSec(audioAbsPath)) ||
    shiftedWords[shiftedWords.length - 1]?.end ||
    1;
  return { byteLength: st.size, durationSec, words: shiftedWords };
}

/**
 * Memotong jeda hening di awal dan akhir file audio MP3 sebelum durasinya diukur (R3-1).
 */
export async function trimAudioSilence(audioAbsPath: string): Promise<number> {
  const tmpTrimPath = `${audioAbsPath}.trim.mp3`;
  try {
    await execFileAsync(ffmpegInstaller.path, [
      "-y",
      "-i",
      audioAbsPath,
      "-af",
      TRIM_SILENCE_FILTER,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      tmpTrimPath,
    ]);
    await rename(tmpTrimPath, audioAbsPath);
  } catch (err) {
    console.warn(
      `[VoiceOver] Gagal trim silence ${path.basename(audioAbsPath)}:`,
      err instanceof Error ? err.message : String(err)
    );
    await rm(tmpTrimPath, { force: true }).catch(() => {});
  }
  const st = await stat(audioAbsPath);
  return st.size;
}

export type VoiceId = "id-ID-ArdiNeural" | "id-ID-GadisNeural";

