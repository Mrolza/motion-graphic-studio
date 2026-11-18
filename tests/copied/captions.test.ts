import { describe, expect, it } from "vitest";
import { buildCleanCaptions } from "@core/render/captions";

describe("buildCleanCaptions (M5.5)", () => {
  it("breaks at punctuation, limits to 2 lines <= maxCharsPerLine, and bridges gaps < 0.3s", () => {
    const captions = buildCleanCaptions(
      [
        { text: "Halo", start: 0.0, end: 0.3 },
        { text: "semua,", start: 0.35, end: 0.7 },
        { text: "ini", start: 0.85, end: 1.1 },
        { text: "kalimat", start: 1.15, end: 1.6 },
        { text: "kedua", start: 1.65, end: 2.0 },
        { text: "panjang.", start: 2.05, end: 2.5 },
      ],
      20
    );
    expect(captions).toHaveLength(2);
    expect(captions[0].lines).toEqual(["Halo semua,"]);
    expect(captions[0].end_sec).toBe(captions[1].start_sec);
    expect(captions[1].lines.length).toBeLessThanOrEqual(2);
  });
});
