import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { QcIssue } from '@core/contracts/qc-report';
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
