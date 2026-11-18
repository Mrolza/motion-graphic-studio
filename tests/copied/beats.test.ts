import { describe, expect, it } from "vitest";
import { allocateBeatDurations, groupBeatsByScene } from "@core/timeline/beats";

describe("groupBeatsByScene", () => {
  it("groups beats by scene_number and sorts beats naturally by beat_id", () => {
    const items = [
      { scene_number: 2, beat_id: "s2b2", narration: "b" },
      { scene_number: 1, beat_id: "s1b2", narration: "d" },
      { scene_number: 2, beat_id: "s2b1", narration: "a" },
      { scene_number: 1, beat_id: "s1b1", narration: "c" },
    ];
    const grouped = groupBeatsByScene(items);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].scene_number).toBe(1);
    expect(grouped[0].beats.map((b) => b.beat_id)).toEqual(["s1b1", "s1b2"]);
    expect(grouped[1].scene_number).toBe(2);
    expect(grouped[1].beats.map((b) => b.beat_id)).toEqual(["s2b1", "s2b2"]);
  });
});

describe("allocateBeatDurations", () => {
  it("allocates durations proportionally and sums to exact audioSec within 1ms", () => {
    const D = 6.37;
    const anchors = [
      "Ini kalimat pembuka yang lebih pendek.",
      "Sedangkan bagian kedua ini jauh lebih panjang daripada bagian pertama supaya bobotnya berbeda.",
    ];
    const durs = allocateBeatDurations(D, anchors);
    expect(durs).toHaveLength(2);
    const sum = durs.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - D)).toBeLessThanOrEqual(0.001);
    expect(durs[0]).toBeGreaterThanOrEqual(1.2);
    expect(durs[1]).toBeGreaterThan(durs[0]);
  });

  it("handles single beat and respects minSec when D allows", () => {
    expect(allocateBeatDurations(4.5, ["Satu beat saja"])).toEqual([4.5]);
    const durs = allocateBeatDurations(5.0, ["Hi", "Kalimat kedua panjang sekali di sini"], 1.2);
    const sum = durs.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 5.0)).toBeLessThanOrEqual(0.001);
    expect(durs[0]).toBeGreaterThanOrEqual(1.19);
  });
});
