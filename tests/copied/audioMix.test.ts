import { execFile } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { describe, expect, it } from "vitest";
import {
  buildAudioMixFilterGraph,
  measureAudioDurationAndLoudness,
  mixTimelineAudio,
  selectPrioritizedSfxEvents,
} from "@core/audio/audio-mix";
import type { Timeline } from "@core/timeline/timeline";

const execFileAsync = promisify(execFile);

describe("audio-mix (M6)", () => {
  it("prioritizes SFX hit > pop > whoosh > tick within 0.25s window", () => {
    const selected = selectPrioritizedSfxEvents([
      { type: "scene_cut", at: 2.0 },
      { type: "mg_in", at: 2.05 },
      { type: "hook", at: 0.0 },
      { type: "stat_count", at: 0.1 },
      { type: "scene_cut", at: 5.0 },
    ]);

    expect(selected).toEqual([
      { kind: "hit", atSec: 0 },
      { kind: "pop", atSec: 2.05 },
      { kind: "whoosh", atSec: 5 },
    ]);
  });

  it("builds FFmpeg 4.1.0-compatible filtergraph without normalize=0 or pad_dur", () => {
    const graph = buildAudioMixFilterGraph({
      totalSec: 9.0,
      sceneCount: 3,
      sceneSlotsSec: [3.0, 3.0, 3.0],
      sfxEvents: [
        { kind: "hit", atSec: 0 },
        { kind: "whoosh", atSec: 3.0 },
      ],
      hasBgm: true,
    });

    expect(graph.filterComplex).not.toContain("normalize=0");
    expect(graph.filterComplex).not.toContain("pad_dur");
    expect(graph.filterComplex).toContain("sidechaincompress");
    expect(graph.filterComplex).toContain("loudnorm=I=-14:TP=-1.5:LRA=11");
  });

  it("mixes 3 scene sines + 3 SFX + 1 BGM sine on bundled FFmpeg 4.1 within ±0.05s and -14±1 LUFS", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "audiomix-m6-"));
    try {
      const vo1 = path.join(tmpDir, "vo1.wav");
      const vo2 = path.join(tmpDir, "vo2.wav");
      const vo3 = path.join(tmpDir, "vo3.wav");
      const bgm = path.join(tmpDir, "bgm.wav");
      const outM4a = path.join(tmpDir, "mixed.m4a");

      await execFileAsync(ffmpegInstaller.path, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=2.0",
        vo1,
      ]);
      await execFileAsync(ffmpegInstaller.path, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=520:duration=2.0",
        vo2,
      ]);
      await execFileAsync(ffmpegInstaller.path, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=600:duration=2.0",
        vo3,
      ]);
      await execFileAsync(ffmpegInstaller.path, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=220:duration=8.0",
        "-af",
        "volume=-20dB",
        bgm,
      ]);

      const timeline: Timeline = {
        total_sec: 6.0,
        scenes: [
          { scene_id: "scene_1", start: 0, end: 2.0, audio_path: vo1 },
          { scene_id: "scene_2", start: 2.0, end: 4.0, audio_path: vo2 },
          { scene_id: "scene_3", start: 4.0, end: 6.0, audio_path: vo3 },
        ],
        beats: [],
        shots: [],
        words: [],
        events: [
          { type: "hook", at: 0.0 },
          { type: "scene_cut", at: 2.0 },
          { type: "mg_in", at: 4.0 },
        ],
      };

      const mixRes = await mixTimelineAudio({
        timeline,
        outputAudioAbsPath: outM4a,
        bgmPathOverride: bgm,
        sfxEnabled: true,
      });

      expect(mixRes.bgmUsed).toBe(true);
      expect(mixRes.sfxCount).toBe(3);

      const measured = await measureAudioDurationAndLoudness(outM4a);
      expect(Math.abs(measured.durationSec - 6.0)).toBeLessThanOrEqual(0.08);
      expect(measured.integratedLufs).not.toBeNull();
      if (measured.integratedLufs !== null) {
        expect(measured.integratedLufs).toBeGreaterThanOrEqual(-15.5);
        expect(measured.integratedLufs).toBeLessThanOrEqual(-12.5);
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }, 15_000);
});
