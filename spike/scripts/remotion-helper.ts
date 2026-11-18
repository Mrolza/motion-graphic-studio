import path from 'node:path';
import fs from 'node:fs';
import { bundle } from '@remotion/bundler';
import { PNG } from 'pngjs';

export const SPIKE_ROOT = path.resolve(import.meta.dirname, '..');
export const REPO_ROOT = path.resolve(SPIKE_ROOT, '..');
export const OUT_REVIEW_P0 = path.join(REPO_ROOT, 'out', 'review', 'p0');

export async function bundleSpike(entryPoint = path.join(SPIKE_ROOT, 'src', 'index.ts')): Promise<string> {
  return bundle({
    entryPoint,
    webpackOverride: (config) => {
      return {
        ...config,
        resolve: {
          ...config.resolve,
          alias: {
            ...(config.resolve?.alias ?? {}),
            '@kit': path.join(SPIKE_ROOT, 'src', 'kit'),
          },
        },
      };
    },
  });
}

export interface BlankCheckResult {
  isBlank: boolean;
  meanLuma: number;
  stdDevLuma: number;
  nonBgRatio: number;
  width: number;
  height: number;
}

/**
 * Checks if a rendered PNG frame is blank/black or uniform background.
 */
export function checkPngNotBlank(pngPath: string): BlankCheckResult {
  const buf = fs.readFileSync(pngPath);
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  const totalPixels = width * height;

  let sumLuma = 0;
  let sumSqLuma = 0;
  let nonBgCount = 0;

  // Blueprint bg is #071426 -> rgb(7, 20, 38), luma ~18.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sumLuma += luma;
    sumSqLuma += luma * luma;
    if (Math.abs(r - 7) > 12 || Math.abs(g - 20) > 12 || Math.abs(b - 38) > 12) {
      nonBgCount++;
    }
  }

  const meanLuma = sumLuma / totalPixels;
  const variance = Math.max(0, sumSqLuma / totalPixels - meanLuma * meanLuma);
  const stdDevLuma = Math.sqrt(variance);
  const nonBgRatio = nonBgCount / totalPixels;

  const isBlank = meanLuma < 5 || stdDevLuma < 4 || nonBgRatio < 0.015;
  return {
    isBlank,
    meanLuma: Number(meanLuma.toFixed(2)),
    stdDevLuma: Number(stdDevLuma.toFixed(2)),
    nonBgRatio: Number(nonBgRatio.toFixed(4)),
    width,
    height,
  };
}

export function comparePngs(pathA: string, pathB: string): {
  meanDiff: number;
  maxDiff: number;
  withinToleranceRatio: number;
} {
  const pngA = PNG.sync.read(fs.readFileSync(pathA));
  const pngB = PNG.sync.read(fs.readFileSync(pathB));
  const len = Math.min(pngA.data.length, pngB.data.length);
  const pixels = len / 4;
  let totalDiff = 0;
  let maxDiff = 0;
  let closePixels = 0;

  for (let i = 0; i < len; i += 4) {
    const dr = Math.abs(pngA.data[i] - pngB.data[i]);
    const dg = Math.abs(pngA.data[i + 1] - pngB.data[i + 1]);
    const db = Math.abs(pngA.data[i + 2] - pngB.data[i + 2]);
    const avg = (dr + dg + db) / 3;
    totalDiff += avg;
    if (avg > maxDiff) maxDiff = avg;
    if (avg <= 8) closePixels++;
  }

  return {
    meanDiff: Number((totalDiff / pixels).toFixed(3)),
    maxDiff: Number(maxDiff.toFixed(1)),
    withinToleranceRatio: Number((closePixels / pixels).toFixed(4)),
  };
}
