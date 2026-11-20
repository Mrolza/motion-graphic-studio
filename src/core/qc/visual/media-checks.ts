import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { QcIssue } from '@core/contracts/qc-report';
import { QUANTITY_LABELS } from '@core/qc/l5-semantic';
import type { TelemetrySample, VisualCheckSpec } from './types';

const execFileAsync = promisify(execFile);

/**
 * Checks that the primary driver begins moving within ±toleranceSec of syncTargetSec.
 */
export function checkSyncFromTelemetry(
  samples: TelemetrySample[],
  spec: VisualCheckSpec
): QcIssue[] {
  const issues: QcIssue[] = [];
  if (spec.syncTargetSec === undefined || samples.length === 0) return issues;
  const target = spec.syncTargetSec;
  const tol = spec.syncToleranceSec ?? 0.3;

  const firstDriverName = Object.keys(samples[0]!.drivers)[0];
  if (!firstDriverName) {
    issues.push({
      severity: 'error',
      message: `SYNC_NO_DRIVER: tidak ada driver untuk memeriksa sinkronisasi pada target ${target.toFixed(2)}s`,
      ref: spec.compositionId,
    });
    return issues;
  }

  const v0 = samples[0]!.drivers[firstDriverName]!.value;
  let actualStartSec: number | undefined;
  for (const s of samples) {
    const val = s.drivers[firstDriverName]?.value;
    if (val !== undefined && Math.abs(val - v0) > 1e-3) {
      actualStartSec = s.sec;
      break;
    }
  }

  if (actualStartSec === undefined || Math.abs(actualStartSec - target) > tol) {
    issues.push({
      severity: 'error',
      message: `SYNC_OUT_OF_WINDOW: gerak utama "${firstDriverName}" mulai pada ${
        actualStartSec !== undefined ? `${actualStartSec.toFixed(2)}s` : 'tidak bergerak'
      } (target ${target.toFixed(2)}s ±${tol}s)`,
      ref: spec.compositionId,
    });
  }
  return issues;
}

/**
 * Runtime L5 check: every rendered HUD element must have a valid storyboard hud_id,
 * and every number/unit must match its referenced verified claim.
 */
export function checkOnscreenTruthFromTelemetry(
  samples: TelemetrySample[],
  spec: VisualCheckSpec
): QcIssue[] {
  const issues: QcIssue[] = [];
  if (!spec.expectedHud) return issues;
  const expectedMap = new Map(spec.expectedHud.map((e) => [e.hud_id, e]));
  const seen = new Set<string>();

  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;
    for (const h of sample.hud) {
      const hid = h.hud_id ?? h.id;
      if (hid === '__kit_exaggeration_badge' || hid === '__kit_captions') continue;
      const exp = expectedMap.get(hid);
      if (!exp) {
        const key = `unsanctioned:${hid}`;
        if (!seen.has(key)) {
          seen.add(key);
          issues.push({
            severity: 'error',
            message: `L5_UNSANCTIONED_HUD: elemen HUD "${hid}" ("${h.text}") tidak ada di storyboard`,
            ref,
          });
        }
        continue;
      }

      if (exp.bind_to_driver) {
        const expectedLabel = exp.quantity ? QUANTITY_LABELS[exp.quantity] : undefined;
        if (expectedLabel && !h.text.toLowerCase().includes(expectedLabel.toLowerCase())) {
          const key = `drvlabel:${hid}`;
          if (!seen.has(key)) {
            seen.add(key);
            issues.push({
              severity: 'error',
              message: `L5_DRIVER_LABEL_MISMATCH: HUD "${hid}" ("${h.text}") tidak menyebut besaran "${expectedLabel}"`,
              ref,
            });
          }
        }
        if (exp.display === 'value' && !exp.claim_ref) {
          const key = `drvunsourced:${hid}`;
          if (!seen.has(key)) {
            seen.add(key);
            issues.push({
              severity: 'error',
              message: `L5_UNSOURCED_DRIVER_VALUE: HUD "${hid}" menampilkan angka penggerak tanpa claim_ref pendukung`,
              ref,
            });
          }
        }
        if (exp.display === 'qualitative' && h.numericValue !== undefined) {
          const key = `drvqual:${hid}`;
          if (!seen.has(key)) {
            seen.add(key);
            issues.push({
              severity: 'error',
              message: `L5_UNSOURCED_DRIVER_VALUE: HUD "${hid}" bertipe qualitative tetapi menampilkan angka (${h.numericValue})`,
              ref,
            });
          }
        }
      }

      if (!exp.bind_to_driver && exp.claim_ref) {
        if (exp.claimUnit) {
          const unitMatches = [...h.text.matchAll(/\b\d+(?:[.,]\d+)*\s*(mm|cm|m|km|deg|°|%)\b/gi)];
          for (const um of unitMatches) {
            const actualUnit = um[1]!.toLowerCase();
            const expectedUnit = exp.claimUnit.toLowerCase();
            if (actualUnit !== expectedUnit) {
              const key = `unit:${hid}:${actualUnit}`;
              if (!seen.has(key)) {
                seen.add(key);
                issues.push({
                  severity: 'error',
                  message: `L5_FACT_MISMATCH: HUD "${hid}" menampilkan satuan "${um[1]}" padahal klaim ${exp.claim_ref} bersatuan "${exp.claimUnit}"`,
                  ref,
                });
              }
            }
          }
        }
        if (exp.claimAllowedNumbers && exp.claimAllowedNumbers.length > 0) {
          const numTokens = h.text.match(/\d+(?:[.,]\d+)*/g) ?? [];
          for (const raw of numTokens) {
            const val = /^\d{1,3}(?:\.\d{3})+$/.test(raw)
              ? Number(raw.replace(/\./g, ''))
              : Number(raw.replace(',', '.'));
            if (
              Number.isFinite(val) &&
              !exp.claimAllowedNumbers.some((a) => Math.abs(a - val) < 1e-4)
            ) {
              const key = `num:${hid}:${val}`;
              if (!seen.has(key)) {
                seen.add(key);
                issues.push({
                  severity: 'error',
                  message: `L5_FACT_MISMATCH: angka ${raw} pada HUD "${hid}" tidak cocok dengan klaim ${exp.claim_ref}`,
                  ref,
                });
              }
            }
          }
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
