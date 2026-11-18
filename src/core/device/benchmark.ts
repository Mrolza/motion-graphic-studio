import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

export interface GlBenchmarkEntry {
  gl: 'angle' | 'swangle';
  concurrency: number;
  renderMs: number;
  minFreeRamMb: number;
  ok: boolean;
  error?: string;
}

export async function runDeviceBenchmark(repoRoot = process.cwd()): Promise<GlBenchmarkEntry[]> {
  const remotionDir = path.join(repoRoot, 'remotion');
  const entryPoint = path.join(remotionDir, 'src', 'index.ts');
  const tmpDir = path.join(repoRoot, '.mgs', 'tmp-bench');
  await mkdir(tmpDir, { recursive: true });

  const serveUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...(config.resolve?.alias ?? {}),
          '@kit': path.join(remotionDir, 'src', 'kit'),
        },
      },
    }),
  });

  const results: GlBenchmarkEntry[] = [];
  for (const gl of ['angle', 'swangle'] as const) {
    const concurrency = gl === 'angle' ? 2 : 1;
    const outFile = path.join(tmpDir, `bench-${gl}.mp4`);
    let minFreeRamMb = Math.round(os.freemem() / (1024 * 1024));
    const timer = setInterval(() => {
      const free = Math.round(os.freemem() / (1024 * 1024));
      if (free < minFreeRamMb) minFreeRamMb = free;
    }, 400);

    const t0 = Date.now();
    try {
      const composition = await selectComposition({
        serveUrl,
        id: 'KitSample',
        chromiumOptions: { gl },
      });
      await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        outputLocation: outFile,
        concurrency,
        chromiumOptions: { gl },
        hardwareAcceleration: 'disable',
        logLevel: 'error',
      });
      clearInterval(timer);
      results.push({
        gl,
        concurrency,
        renderMs: Date.now() - t0,
        minFreeRamMb,
        ok: true,
      });
    } catch (err) {
      clearInterval(timer);
      results.push({
        gl,
        concurrency,
        renderMs: Date.now() - t0,
        minFreeRamMb,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  return results;
}
