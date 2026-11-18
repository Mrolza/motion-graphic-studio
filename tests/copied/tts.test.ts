import { execFile } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { describe, expect, it } from "vitest";
import {
  estimateWordTimingsProportional,
  parseMsEdgeWordBoundaries,
  trimAudioSilence,
} from "@core/audio/tts";

const execFileAsync = promisify(execFile);

describe("trimAudioSilence (R3-1)", () => {
  it("removes leading and trailing silence from MP3 using bundled FFmpeg 4.1", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "tts-trim-test-"));
    const mp3Path = path.join(tmpDir, "sample.mp3");
    try {
      // Buat 1.0s hening + 1.0s nada 440Hz + 1.2s hening (~3.2s)
      await execFileAsync(ffmpegInstaller.path, [
        "-y",
        "-t",
        "1.0",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=24000:duration=1.0",
        "-t",
        "1.2",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-filter_complex",
        "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]",
        "-map",
        "[out]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        mp3Path,
      ]);

      const size = await trimAudioSilence(mp3Path);
      expect(size).toBeGreaterThan(500);

      const { stdout } = await execFileAsync(ffprobeInstaller.path, [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        mp3Path,
      ]);
      const dur = Number(stdout.trim());
      expect(dur).toBeGreaterThan(0.8);
      expect(dur).toBeLessThan(1.4);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }, 15000);

  it("parses msedge-tts 100ns WordBoundary metadata and estimates proportional timings (M2.1)", () => {
    const parsed = parseMsEdgeWordBoundaries({
      Metadata: [
        {
          Type: "WordBoundary",
          Data: { Offset: 1000000, Duration: 2750000, text: { Text: "Halo" } },
        },
        {
          Type: "WordBoundary",
          Data: { Offset: 3750000, Duration: 5750000, text: { Text: "dunia" } },
        },
      ],
    });
    expect(parsed).toEqual([
      { text: "Halo", start: 0.1, end: 0.375 },
      { text: "dunia", start: 0.375, end: 0.95 },
    ]);

    const est = estimateWordTimingsProportional("Halo dunia, ini tes.", 4.0);
    expect(est).toHaveLength(4);
    expect(est[0].start).toBe(0);
    expect(est[3].end).toBe(4.0);
  });
});
