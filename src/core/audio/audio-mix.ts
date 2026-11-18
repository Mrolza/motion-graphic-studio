import { execFile } from "child_process";
import { readdir, stat } from "fs/promises";
import path from "path";
import { promisify } from "util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import type { Timeline, TimelineEvent } from "@core/timeline/timeline";

const execFileAsync = promisify(execFile);

export type SfxKind = "hit" | "pop" | "whoosh" | "tick";

const SFX_PRIORITY: Record<SfxKind, number> = {
  hit: 4,
  pop: 3,
  whoosh: 2,
  tick: 1,
};

export interface ScheduledSfxEvent {
  kind: SfxKind;
  atSec: number;
  filePath: string;
}

export interface AudioMixFilterGraphInput {
  totalSec: number;
  sceneCount: number;
  sceneSlotsSec: number[];
  sfxEvents: Array<{ kind: SfxKind; atSec: number }>;
  hasBgm: boolean;
  sfxVolume?: number;
  bgmVolume?: number;
}

export interface AudioMixFilterGraphResult {
  filterComplex: string;
  outputLabel: string;
  inputCount: number;
}

function eventTypeToSfxKind(
  eventType: TimelineEvent["type"],
  whooshOnSceneCut: boolean
): SfxKind | null {
  switch (eventType) {
    case "hook":
      return "hit";
    case "mg_in":
      return "pop";
    case "stat_count":
      return "tick";
    case "scene_cut":
      return whooshOnSceneCut ? "whoosh" : null;
    default:
      return null;
  }
}

export function selectPrioritizedSfxEvents(
  events: TimelineEvent[],
  options?: { whooshOnSceneCut?: boolean; minGapSec?: number }
): Array<{ kind: SfxKind; atSec: number }> {
  const whooshOnSceneCut = options?.whooshOnSceneCut ?? true;
  const minGapSec = options?.minGapSec ?? 0.25;

  const candidates = events
    .map((ev) => {
      const kind = eventTypeToSfxKind(ev.type, whooshOnSceneCut);
      if (!kind) return null;
      return { kind, atSec: Math.max(0, Number(ev.at.toFixed(3))) };
    })
    .filter((item): item is { kind: SfxKind; atSec: number } => item !== null)
    .sort((a, b) => a.atSec - b.atSec || SFX_PRIORITY[b.kind] - SFX_PRIORITY[a.kind]);

  const selected: Array<{ kind: SfxKind; atSec: number }> = [];
  for (const item of candidates) {
    const prev = selected[selected.length - 1];
    if (prev && Math.abs(item.atSec - prev.atSec) < minGapSec) {
      if (SFX_PRIORITY[item.kind] > SFX_PRIORITY[prev.kind]) {
        selected[selected.length - 1] = item;
      }
      continue;
    }
    selected.push(item);
  }
  return selected;
}

/**
 * Membangun filter_complex FFmpeg 4.1.0-compatible:
 * - Tidak memakai `amix normalize=0` (pakai `amix=...:dropout_transition=0,volume=K`)
 * - Tidak memakai `apad=pad_dur` (pakai `apad,atrim=0:slot`)
 */
export function buildAudioMixFilterGraph(
  input: AudioMixFilterGraphInput
): AudioMixFilterGraphResult {
  const totalSec = Math.max(0.5, Number(input.totalSec.toFixed(3)));
  const sfxVol = Math.max(0.05, Math.min(1.5, input.sfxVolume ?? 0.38));
  const bgmVol = Math.max(0.02, Math.min(1.0, input.bgmVolume ?? 0.22));
  const filters: string[] = [];

  // 1. Narration track: inputs 0 .. sceneCount - 1
  const voLabels: string[] = [];
  for (let i = 0; i < input.sceneCount; i++) {
    const slot = Math.max(0.1, Number((input.sceneSlotsSec[i] ?? 1).toFixed(3)));
    filters.push(
      `[${i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,apad,atrim=0:${slot}[vo_s${i}]`
    );
    voLabels.push(`[vo_s${i}]`);
  }

  let nextIdx = input.sceneCount;
  const hasBgm = input.hasBgm;
  let bgmInputIdx = -1;
  if (hasBgm) {
    bgmInputIdx = nextIdx;
    nextIdx += 1;
  }

  const sfxStartIdx = nextIdx;
  const sfxCount = input.sfxEvents.length;
  nextIdx += sfxCount;

  // Concat VO
  if (input.sceneCount === 1) {
    filters.push(
      `${voLabels[0]}aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[vo_raw]`
    );
  } else {
    filters.push(
      `${voLabels.join("")}concat=n=${input.sceneCount}:v=0:a=1,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[vo_raw]`
    );
  }

  // Split VO if needed for sidechaincompress
  if (hasBgm) {
    filters.push("[vo_raw]asplit=2[vo_mix][vo_sc]");
  } else {
    filters.push("[vo_raw]anull[vo_mix]");
  }

  const mixInputs: string[] = ["[vo_mix]"];

  // 2. BGM track with fade out + sidechain ducking
  if (hasBgm && bgmInputIdx >= 0) {
    const fadeOutSec = Math.min(1.5, Math.max(0.2, totalSec * 0.25));
    const fadeStart = Math.max(0, Number((totalSec - fadeOutSec).toFixed(3)));
    filters.push(
      `[${bgmInputIdx}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,atrim=0:${totalSec},asetpts=PTS-STARTPTS,volume=${bgmVol},afade=t=out:st=${fadeStart}:d=${fadeOutSec.toFixed(3)}[bgm_pre]`
    );
    filters.push(
      `[bgm_pre][vo_sc]sidechaincompress=threshold=0.05:ratio=6:attack=40:release=350[bgm_duck]`
    );
    mixInputs.push("[bgm_duck]");
  }

  // 3. SFX track
  if (sfxCount > 0) {
    const sfxLabels: string[] = [];
    input.sfxEvents.forEach((ev, idx) => {
      const inIdx = sfxStartIdx + idx;
      const delayMs = Math.max(0, Math.round(ev.atSec * 1000));
      filters.push(
        `[${inIdx}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,adelay=${delayMs}|${delayMs},volume=${sfxVol}[sfx_${idx}]`
      );
      sfxLabels.push(`[sfx_${idx}]`);
    });

    if (sfxCount === 1) {
      filters.push(`${sfxLabels[0]}anull[sfx_mix]`);
    } else {
      filters.push(
        `${sfxLabels.join("")}amix=inputs=${sfxCount}:duration=longest:dropout_transition=0,volume=${sfxCount}[sfx_mix]`
      );
    }
    mixInputs.push("[sfx_mix]");
  }

  // 4. Final mix + loudnorm -14 LUFS
  const k = mixInputs.length;
  if (k === 1) {
    filters.push(
      `${mixInputs[0]}loudnorm=I=-14:TP=-1.5:LRA=11[aout]`
    );
  } else {
    filters.push(
      `${mixInputs.join("")}amix=inputs=${k}:duration=first:dropout_transition=0,volume=${k},loudnorm=I=-14:TP=-1.5:LRA=11[aout]`
    );
  }

  return {
    filterComplex: filters.join(";"),
    outputLabel: "[aout]",
    inputCount: nextIdx,
  };
}

async function resolveThemeBgmPath(themeId?: string): Promise<string | null> {
  const candidates: string[] = [];
  if (themeId) {
    candidates.push(path.join(process.cwd(), "public", "bgm", themeId));
  }
  candidates.push(path.join(process.cwd(), "public", "bgm"));

  for (const dir of candidates) {
    try {
      const entries = await readdir(dir);
      const audioFile = entries.find((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f));
      if (audioFile) {
        return path.join(dir, audioFile);
      }
    } catch {
      // ignore missing directory
    }
  }
  return null;
}

async function resolveExistingSfxPath(kind: SfxKind): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), "remotion", "public", "sfx", `${kind}.wav`),
    path.join(process.cwd(), "public", "sfx", `${kind}.wav`),
  ];
  for (const p of candidates) {
    try {
      await stat(p);
      return p;
    } catch {
      // try next
    }
  }
  return null;
}

export async function mixTimelineAudio(params: {
  timeline: Timeline;
  outputAudioAbsPath: string;
  themeId?: string;
  sfxEnabled?: boolean;
  sfxVolume?: number;
  whooshOnSceneCut?: boolean;
  bgmVolume?: number;
  bgmPathOverride?: string | null;
}): Promise<{
  audioPath: string;
  bgmUsed: boolean;
  sfxCount: number;
  durationSec: number;
}> {
  const validScenes = params.timeline.scenes.filter((s) => Boolean(s.audio_path));
  if (validScenes.length === 0) {
    throw new Error("mixTimelineAudio: tidak ada scene audio pada timeline.");
  }

  const bgmPath =
    params.bgmPathOverride !== undefined
      ? params.bgmPathOverride
      : await resolveThemeBgmPath(params.themeId);

  const rawSfx =
    params.sfxEnabled === false
      ? []
      : selectPrioritizedSfxEvents(params.timeline.events, {
          whooshOnSceneCut: params.whooshOnSceneCut ?? true,
        });

  const sfxWithPaths: Array<{ kind: SfxKind; atSec: number; path: string }> = [];
  for (const ev of rawSfx) {
    const p = await resolveExistingSfxPath(ev.kind);
    if (p) {
      sfxWithPaths.push({ ...ev, path: p });
    }
  }

  const sceneSlotsSec = validScenes.map((s) =>
    Math.max(0.1, Number((s.end - s.start).toFixed(3)))
  );

  const graph = buildAudioMixFilterGraph({
    totalSec: params.timeline.total_sec,
    sceneCount: validScenes.length,
    sceneSlotsSec,
    sfxEvents: sfxWithPaths.map((s) => ({ kind: s.kind, atSec: s.atSec })),
    hasBgm: Boolean(bgmPath),
    sfxVolume: params.sfxVolume,
    bgmVolume: params.bgmVolume,
  });

  const totalSecStr = String(
    Math.max(0.5, Number(params.timeline.total_sec.toFixed(3)))
  );
  const args: string[] = ["-y"];
  for (const sc of validScenes) {
    args.push("-i", sc.audio_path);
  }
  if (bgmPath) {
    args.push("-stream_loop", "-1", "-t", totalSecStr, "-i", bgmPath);
  }
  for (const sfx of sfxWithPaths) {
    args.push("-i", sfx.path);
  }

  args.push(
    "-filter_complex",
    graph.filterComplex,
    "-map",
    graph.outputLabel,
    "-t",
    String(Math.max(0.5, Number(params.timeline.total_sec.toFixed(3)))),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    params.outputAudioAbsPath
  );

  await execFileAsync(ffmpegInstaller.path, args, { timeout: 120_000 });

  return {
    audioPath: params.outputAudioAbsPath,
    bgmUsed: Boolean(bgmPath),
    sfxCount: sfxWithPaths.length,
    durationSec: params.timeline.total_sec,
  };
}

export async function muxVideoAndAudio(params: {
  videoAbsPath: string;
  audioAbsPath: string;
  outputMp4AbsPath: string;
}): Promise<void> {
  await execFileAsync(
    ffmpegInstaller.path,
    [
      "-y",
      "-i",
      params.videoAbsPath,
      "-i",
      params.audioAbsPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      "-shortest",
      "-movflags",
      "+faststart",
      params.outputMp4AbsPath,
    ],
    { timeout: 120_000 }
  );
}

export async function measureAudioDurationAndLoudness(audioAbsPath: string): Promise<{
  durationSec: number;
  integratedLufs: number | null;
}> {
  const { stdout: probeOut } = await execFileAsync(ffprobeInstaller.path, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    audioAbsPath,
  ]);
  const durationSec = parseFloat(probeOut.trim()) || 0;

  let integratedLufs: number | null = null;
  try {
    const { stderr } = await execFileAsync(ffmpegInstaller.path, [
      "-nostats",
      "-i",
      audioAbsPath,
      "-af",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ]);
    const matches = stderr.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
    if (matches && matches.length > 0) {
      const last = matches[matches.length - 1];
      const m = last.match(/(-?\d+(?:\.\d+)?)/);
      if (m) integratedLufs = parseFloat(m[1]);
    }
  } catch {
    // ignore ebur128 parse failure
  }

  return { durationSec, integratedLufs };
}
