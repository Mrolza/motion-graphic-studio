export function groupBeatsByScene<
  T extends { scene_number: number; beat_id?: string },
>(items: T[]): Array<{ scene_number: number; beats: T[] }> {
  const map = new Map<number, T[]>();
  for (const it of items) {
    const arr = map.get(it.scene_number) ?? [];
    arr.push(it);
    map.set(it.scene_number, arr);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([scene_number, beats]) => ({
      scene_number,
      beats: [...beats].sort((a, b) =>
        (a.beat_id ?? "").localeCompare(b.beat_id ?? "", undefined, {
          numeric: true,
        })
      ),
    }));
}

/**
 * Bagi durasi audio scene ke tiap beat secara proporsional panjang teks;
 * total PERSIS = audioSec.
 */
export function allocateBeatDurations(
  audioSec: number,
  anchors: string[],
  minSec = 1.2
): number[] {
  if (anchors.length <= 1) return [Math.round(audioSec * 1000) / 1000];
  const w = anchors.map((a) =>
    Math.max(1, a.replace(/\s+/g, " ").trim().length)
  );
  const total = w.reduce((x, y) => x + y, 0);
  let d: number[];
  if (audioSec <= anchors.length * minSec) {
    d = w.map((x) => (x / total) * audioSec);
  } else {
    d = w.map((x) => Math.max(minSec, (x / total) * audioSec));
    const excess = d.reduce((x, y) => x + y, 0) - audioSec;
    if (excess > 0) {
      const reducible = d.reduce((acc, v) => acc + Math.max(0, v - minSec), 0);
      if (reducible > 0) {
        d = d.map((v) =>
          v > minSec ? v - excess * ((v - minSec) / reducible) : v
        );
      }
    }
  }
  const rounded = d.map((x) => Math.round(x * 1000) / 1000);
  rounded[rounded.length - 1] =
    Math.round(
      (audioSec - rounded.slice(0, -1).reduce((x, y) => x + y, 0)) * 1000
    ) / 1000;
  return rounded;
}
