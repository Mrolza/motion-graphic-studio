import { describe, expect, it } from "vitest";
import { buildTimeline } from "@core/timeline/timeline";

describe("buildTimeline (M2.2)", () => {
  it("matches narration_fragment to word boundaries with zero gaps and accurate total_sec", () => {
    const tl = buildTimeline({
      scenes: [
        {
          scene_id: "S01",
          audio_path: "public/audio/s1.mp3",
          duration_sec: 4.0,
          words: [
            { text: "Jam", start: 0.0, end: 0.4 },
            { text: "mekanik", start: 0.45, end: 1.0 },
            { text: "bekerja", start: 1.05, end: 1.6 },
            { text: "tanpa", start: 1.8, end: 2.3 },
            { text: "baterai", start: 2.35, end: 3.1 },
            { text: "sama", start: 3.15, end: 3.5 },
            { text: "sekali.", start: 3.55, end: 4.0 },
          ],
        },
        {
          scene_id: "S02",
          audio_path: "public/audio/s2.mp3",
          duration_sec: 3.0,
          words: [
            { text: "Rahasianya", start: 0.0, end: 1.0 },
            { text: "ada", start: 1.05, end: 1.4 },
            { text: "di", start: 1.45, end: 1.7 },
            { text: "pegas", start: 1.75, end: 2.3 },
            { text: "baja.", start: 2.35, end: 3.0 },
          ],
        },
      ],
      beats: [
        {
          beat_id: "S01B1",
          scene_id: "S01",
          narration_fragment: "Jam mekanik bekerja",
        },
        {
          beat_id: "S01B2",
          scene_id: "S01",
          narration_fragment: "tanpa baterai sama sekali.",
          asset_mode: "motion_graphic",
          motion_graphic: { type: "stat" },
        },
        {
          beat_id: "S02B1",
          scene_id: "S02",
          narration_fragment: "Rahasianya ada di pegas baja.",
        },
      ],
      sceneGapSec: 0.2,
      maxShotSec: 3.0,
    });

    expect(tl.total_sec).toBe(7.2); // 4.0 + 0.2 + 3.0
    expect(tl.scenes[0]).toMatchObject({ start: 0, end: 4.0 });
    expect(tl.scenes[1]).toMatchObject({ start: 4.2, end: 7.2 });

    // Beat 1 ends right where "tanpa" starts (1.8), Beat 2 starts at 1.8 and ends at 4.0
    expect(tl.beats[0]).toMatchObject({ beat_id: "S01B1", start: 0, end: 1.8 });
    expect(tl.beats[1]).toMatchObject({ beat_id: "S01B2", start: 1.8, end: 4.0 });

    // Events: hook@0, mg_in@1.8, stat_count@1.8, scene_cut@4.2
    expect(tl.events.map((e) => e.type)).toEqual([
      "hook",
      "mg_in",
      "stat_count",
      "scene_cut",
    ]);
  });

  it("falls back to character-weight allocation when fragment matching fails", () => {
    const tl = buildTimeline({
      scenes: [
        {
          scene_id: "S01",
          audio_path: "public/audio/s1.mp3",
          duration_sec: 5.0,
          words: [{ text: "Berbeda", start: 0, end: 5.0 }],
        },
      ],
      beats: [
        {
          beat_id: "S01B1",
          scene_id: "S01",
          narration_fragment: "Fragmen pertama pendek",
        },
        {
          beat_id: "S01B2",
          scene_id: "S01",
          narration_fragment: "Fragmen kedua jauh lebih panjang daripada fragmen pertama",
        },
      ],
      maxShotSec: 3.0,
    });

    expect(tl.beats).toHaveLength(2);
    expect(tl.beats[0].start).toBe(0);
    expect(tl.beats[0].end).toBe(tl.beats[1].start);
    expect(tl.beats[1].end).toBe(5.0);
  });

  it("splits a 7-second beat into 3 reframe shots when maxShotSec is 3", () => {
    const tl = buildTimeline({
      scenes: [
        {
          scene_id: "S01",
          audio_path: "public/audio/s1.mp3",
          duration_sec: 7.0,
          words: [{ text: "Panjang", start: 0, end: 7.0 }],
        },
      ],
      beats: [
        {
          beat_id: "S01B1",
          scene_id: "S01",
          narration_fragment: "Panjang",
        },
      ],
      maxShotSec: 3.0,
    });

    expect(tl.shots).toHaveLength(3);
    expect(tl.shots.map((s) => s.reframe_index)).toEqual([0, 1, 2]);
    expect(tl.shots[0].start).toBe(0);
    expect(tl.shots[2].end).toBe(7.0);
  });

  it("merges beats shorter than 1.0s into neighbor", () => {
    const tl = buildTimeline({
      scenes: [
        {
          scene_id: "S01",
          audio_path: "public/audio/s1.mp3",
          duration_sec: 4.0,
          words: [
            { text: "Hai", start: 0, end: 0.5 },
            { text: "ini", start: 0.6, end: 1.5 },
            { text: "kalimat", start: 1.5, end: 2.5 },
            { text: "panjang.", start: 2.5, end: 4.0 },
          ],
        },
      ],
      beats: [
        { beat_id: "S01B1", scene_id: "S01", narration_fragment: "Hai" },
        {
          beat_id: "S01B2",
          scene_id: "S01",
          narration_fragment: "ini kalimat panjang.",
        },
      ],
      maxShotSec: 3.0,
    });

    expect(tl.beats).toHaveLength(1);
    expect(tl.beats[0].start).toBe(0);
    expect(tl.beats[0].end).toBe(4.0);
  });
});
