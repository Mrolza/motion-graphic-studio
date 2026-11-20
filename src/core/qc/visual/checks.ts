import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { QcIssue } from '@core/contracts/qc-report';
import type { ScreenBox, TelemetrySample, VisualCheckSpec } from './types';

const execFileAsync = promisify(execFile);

function intersectionArea(a: ScreenBox, b: ScreenBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

/**
 * Checks mechanical invariants and HUD-to-driver bindings across sampled telemetry frames.
 */
export function checkMechanicsFromTelemetry(
  samples: TelemetrySample[],
  spec: VisualCheckSpec
): QcIssue[] {
  const issues: QcIssue[] = [];
  if (samples.length === 0) {
    issues.push({ severity: 'error', message: 'MECHANICS_NO_TELEMETRY: tidak ada sampel telemetri', ref: spec.compositionId });
    return issues;
  }

  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;

    for (const inv of spec.invariants) {
      if (inv.kind === 'driver_state') {
        const driverEntry = inv.driverName
          ? sample.drivers[inv.driverName]
          : Object.values(sample.drivers)[0];
        if (!driverEntry) continue;
        const eps = inv.epsilon ?? 0.5;
        const [minV, maxV] = inv.whenDriverBetween;
        if (driverEntry.value > minV + eps && driverEntry.value < maxV - eps) {
          const ent = sample.entities.find((e) => e.id === inv.entity);
          const actual = ent?.partStates?.[inv.stateKey];
          if (actual !== inv.expectedValue) {
            issues.push({
              severity: 'error',
              message: `MECHANICS_INVARIANT: ${inv.entity}.${inv.stateKey}=${String(actual)} (harus ${String(inv.expectedValue)} saat driver=${driverEntry.value})`,
              ref,
            });
          }
        }
      } else if (inv.kind === 'hud_matches_driver') {
        const driverEntry = sample.drivers[inv.driverName];
        const hudItem = sample.hud.find((h) => h.id === inv.hudId);
        if (!driverEntry || !hudItem || hudItem.numericValue === undefined) continue;
        const tol = inv.tolerance ?? 1.5;
        if (Math.abs(hudItem.numericValue - driverEntry.value) > tol) {
          issues.push({
            severity: 'error',
            message: `MECHANICS_HUD_MISMATCH: HUD "${inv.hudId}"=${hudItem.numericValue} != driver "${inv.driverName}"=${driverEntry.value}`,
            ref,
          });
        }
      } else if (inv.kind === 'wheel_angle_matches_distance') {
        const ent = sample.entities.find((e) => e.id === inv.entity);
        const dist = Number(ent?.partStates?.distance ?? NaN);
        const angleDeg = Number(ent?.partStates?.wheel_angle_deg ?? NaN);
        if (!Number.isFinite(dist) || !Number.isFinite(angleDeg)) continue;
        const expectedDeg = ((dist / inv.radius) * 180) / Math.PI;
        if (Math.abs(angleDeg - expectedDeg) > (inv.toleranceDeg ?? 1.5)) {
          issues.push({
            severity: 'error',
            message: `MECHANICS_KINEMATICS: wheel_angle_deg=${angleDeg} != expected=${expectedDeg.toFixed(2)}`,
            ref,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * Checks that all declared focus entities stay inside 9:16 safe bounds on every sample frame.
 */
export function checkFramingFromTelemetry(
  samples: TelemetrySample[],
  spec: VisualCheckSpec
): QcIssue[] {
  const issues: QcIssue[] = [];
  const safe = spec.safeBounds ?? { minX: 0, maxX: 720, minY: 60, maxY: 1220 };

  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;
    for (const focusId of spec.focusEntities) {
      const ent = sample.entities.find((e) => e.id === focusId);
      if (!ent || !ent.bbox) {
        issues.push({
          severity: 'error',
          message: `FRAMING_MISSING_ENTITY: entitas fokus "${focusId}" tidak memiliki bbox telemetri`,
          ref,
        });
        continue;
      }
      const b = ent.bbox;
      if (
        b.width <= 0 ||
        b.height <= 0 ||
        b.x < safe.minX ||
        b.x + b.width > safe.maxX ||
        b.y < safe.minY ||
        b.y + b.height > safe.maxY
      ) {
        issues.push({
          severity: 'error',
          message: `FRAMING_OUT_OF_BOUNDS: "${focusId}" bbox=[${b.x},${b.y},${b.width}x${b.height}] keluar area aman [${safe.minX}..${safe.maxX}, ${safe.minY}..${safe.maxY}]`,
          ref,
        });
      }
    }
  }
  return issues;
}

/**
 * Checks that no two HUD elements overlap and HUD does not excessively cover focus entities.
 */
export function checkHudOverlapFromTelemetry(
  samples: TelemetrySample[],
  spec: VisualCheckSpec
): QcIssue[] {
  const issues: QcIssue[] = [];
  const maxCover = spec.maxHudOverlapRatio ?? 0.35;

  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;
    const huds = sample.hud;

    for (let i = 0; i < huds.length; i++) {
      for (let j = i + 1; j < huds.length; j++) {
        const a = huds[i]!;
        const b = huds[j]!;
        const area = intersectionArea(a.bbox, b.bbox);
        if (area > 4) {
          issues.push({
            severity: 'error',
            message: `HUD_OVERLAP: "${a.id}" bertumpuk dengan "${b.id}" (area=${Math.round(area)}px²)`,
            ref,
          });
        }
      }
    }

    for (const focusId of spec.focusEntities) {
      const ent = sample.entities.find((e) => e.id === focusId);
      if (!ent?.bbox) continue;
      const focusArea = Math.max(1, ent.bbox.width * ent.bbox.height);
      for (const h of huds) {
        const coverArea = intersectionArea(ent.bbox, h.bbox);
        if (coverArea / focusArea > maxCover) {
          issues.push({
            severity: 'error',
            message: `HUD_COVERS_FOCUS: "${h.id}" menutupi ${Math.round((coverArea / focusArea) * 100)}% entitas "${focusId}"`,
            ref,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * Checks that numbers displayed in HUD follow Indonesian formatting (no English thousands comma like 1,435).
 */
export function checkHudFormatFromTelemetry(samples: TelemetrySample[]): QcIssue[] {
  const issues: QcIssue[] = [];
  const seen = new Set<string>();

  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;
    for (const h of sample.hud) {
      const badMatches = h.text.match(/\b\d{1,3}(?:,\d{3})+\b/g);
      if (badMatches && badMatches.length > 0) {
        const key = `${h.id}:${badMatches.join(',')}`;
        if (!seen.has(key)) {
          seen.add(key);
          issues.push({
            severity: 'error',
            message: `HUD_FORMAT_NOT_ID: "${h.id}" memakai format ribuan non-Indonesia (${badMatches.join(', ')}) pada "${h.text}"`,
            ref,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * Checks sampled PNG frames using FFmpeg rawvideo luminance mean and standard deviation.
 */
export async function checkBlankFrames(framePngPaths: string[]): Promise<QcIssue[]> {
  const issues: QcIssue[] = [];
  const ffmpegBin = ffmpegInstaller.path;

  for (const pngPath of framePngPaths) {
    const { stdout } = await execFileAsync(
      ffmpegBin,
      ['-v', 'error', '-i', pngPath, '-vf', 'scale=90:160', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: 1024 * 1024 }
    );
    const buf = stdout as unknown as Buffer;
    const pixelCount = Math.floor(buf.length / 3);
    if (pixelCount === 0) {
      issues.push({ severity: 'error', message: 'BLANK_FRAME: gagal membaca piksel frame', ref: pngPath });
      continue;
    }
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < pixelCount * 3; i += 3) {
      const luma = 0.2126 * buf[i]! + 0.7152 * buf[i + 1]! + 0.0722 * buf[i + 2]!;
      sum += luma;
      sumSq += luma * luma;
    }
    const mean = sum / pixelCount;
    const variance = Math.max(0, sumSq / pixelCount - mean * mean);
    const std = Math.sqrt(variance);
    if (mean < 4 || std < 2) {
      issues.push({
        severity: 'error',
        message: `BLANK_FRAME: frame kosong/datar (meanLuma=${mean.toFixed(2)}, std=${std.toFixed(2)})`,
        ref: pngPath,
      });
    }
  }
  return issues;
}
