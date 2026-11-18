import { useCurrentFrame, useVideoConfig } from 'remotion';

export type EasingMode = 'linear' | 'easeOut' | 'easeInOut';

export function useSceneTime(): { sec: number; frame: number; fps: number; durationSec: number } {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return {
    sec: frame / fps,
    frame,
    fps,
    durationSec: durationInFrames / fps,
  };
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function applyEasing(t: number, mode: EasingMode = 'easeInOut'): number {
  const x = clamp01(t);
  if (mode === 'linear') return x;
  if (mode === 'easeOut') return 1 - Math.pow(1 - x, 3);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function getLocalProgress(
  sec: number,
  startSec = 0,
  durationSec = 1,
  easing: EasingMode = 'easeInOut'
): number {
  if (durationSec <= 0) return sec >= startSec ? 1 : 0;
  const raw = clamp01((sec - startSec) / durationSec);
  return applyEasing(raw, easing);
}

/**
 * Returns rotation angle in radians for continuous spinning.
 */
export function spin(
  sec: number,
  startSec = 0,
  durationSec = 999,
  rps = 1.5
): number {
  const activeSec = Math.max(0, Math.min(sec - startSec, durationSec));
  return activeSec * rps * Math.PI * 2;
}

/**
 * Interpolates a 3D point along a linear path from `from` to `to`.
 */
export function translatePath(
  sec: number,
  startSec: number,
  durationSec: number,
  from: [number, number, number],
  to: [number, number, number],
  easing: EasingMode = 'easeInOut'
): [number, number, number] {
  const p = getLocalProgress(sec, startSec, durationSec, easing);
  return [
    from[0] + (to[0] - from[0]) * p,
    from[1] + (to[1] - from[1]) * p,
    from[2] + (to[2] - from[2]) * p,
  ];
}

/**
 * Returns a smooth sinusoidal oscillation offset in [-amplitude, +amplitude].
 */
export function oscillate(
  sec: number,
  startSec = 0,
  durationSec = 999,
  amplitude = 0.25,
  freqHz = 2.0
): number {
  if (sec < startSec || sec > startSec + durationSec) return 0;
  const local = sec - startSec;
  return Math.sin(local * freqHz * Math.PI * 2) * amplitude;
}

/**
 * Returns a pulsing highlight intensity in [0, 1] during [startSec, startSec + durationSec].
 */
export function highlight(
  sec: number,
  startSec = 0,
  durationSec = 2,
  pulseHz = 2.0
): number {
  if (sec < startSec || sec > startSec + durationSec) return 0;
  const local = sec - startSec;
  const envelope =
    Math.min(1, local / 0.25) * Math.min(1, (startSec + durationSec - sec) / 0.25);
  const pulse = 0.55 + 0.45 * Math.sin(local * pulseHz * Math.PI * 2);
  return clamp01(envelope * pulse);
}
