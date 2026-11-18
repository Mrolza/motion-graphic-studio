import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import {
  bundleSpike,
  checkPngNotBlank,
  comparePngs,
  OUT_REVIEW_P0,
  SPIKE_ROOT,
} from './remotion-helper';

interface RunResult {
  gl: 'angle' | 'swangle';
  concurrency: number;
  hardwareAcceleration: 'if-possible' | 'disable';
  renderMs: number;
  minFreeRamMb: number;
  startFreeRamMb: number;
  status: 'ok' | 'error';
  error?: string;
}

async function runBenchmark() {
  fs.mkdirSync(OUT_REVIEW_P0, { recursive: true });
  const benchOutDir = path.join(SPIKE_ROOT, '.cache', 'benchmark');
  fs.mkdirSync(benchOutDir, { recursive: true });

  console.log('Bundling spike composition...');
  const bundleLocation = await bundleSpike();

  const glModes: Array<'angle' | 'swangle'> = ['angle', 'swangle'];
  const concurrencies = [1, 2, 4];
  const results: RunResult[] = [];

  for (const gl of glModes) {
    for (const concurrency of concurrencies) {
      const outVideo = path.join(benchOutDir, `bench-${gl}-c${concurrency}.mp4`);
      const startFreeRamMb = Math.round(os.freemem() / (1024 * 1024));
      let minFreeRamMb = startFreeRamMb;
      const timer = setInterval(() => {
        const free = Math.round(os.freemem() / (1024 * 1024));
        if (free < minFreeRamMb) minFreeRamMb = free;
      }, 400);

      console.log(`Rendering BenchmarkScene: gl=${gl}, concurrency=${concurrency}...`);
      const t0 = Date.now();
      try {
        const composition = await selectComposition({
          serveUrl: bundleLocation,
          id: 'BenchmarkScene',
          chromiumOptions: { gl },
        });
        await renderMedia({
          composition,
          serveUrl: bundleLocation,
          codec: 'h264',
          outputLocation: outVideo,
          concurrency,
          chromiumOptions: { gl },
          hardwareAcceleration: 'disable',
          logLevel: 'warn',
        });
        const renderMs = Date.now() - t0;
        clearInterval(timer);
        console.log(`  OK: ${renderMs} ms, minFreeRam=${minFreeRamMb} MB`);
        results.push({
          gl,
          concurrency,
          hardwareAcceleration: 'disable',
          renderMs,
          minFreeRamMb,
          startFreeRamMb,
          status: 'ok',
        });
      } catch (err) {
        clearInterval(timer);
        const renderMs = Date.now() - t0;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ERR: ${msg}`);
        results.push({
          gl,
          concurrency,
          hardwareAcceleration: 'if-possible',
          renderMs,
          minFreeRamMb,
          startFreeRamMb,
          status: 'error',
          error: msg,
        });
      }
    }
  }

  // Render still comparison between angle and swangle at frame 90
  const stillAngle = path.join(benchOutDir, 'still-angle-90.png');
  const stillSwangle = path.join(benchOutDir, 'still-swangle-90.png');

  for (const [gl, outPath] of [
    ['angle', stillAngle],
    ['swangle', stillSwangle],
  ] as const) {
    const comp = await selectComposition({
      serveUrl: bundleLocation,
      id: 'BenchmarkScene',
      chromiumOptions: { gl },
    });
    await renderStill({
      composition: comp,
      serveUrl: bundleLocation,
      frame: 90,
      output: outPath,
      chromiumOptions: { gl },
      logLevel: 'warn',
    });
  }

  const angleBlank = checkPngNotBlank(stillAngle);
  const swangleBlank = checkPngNotBlank(stillSwangle);
  const visualDiff = comparePngs(stillAngle, stillSwangle);

  const summary = {
    timestamp: new Date().toISOString(),
    platform: `${os.platform()} ${os.release()} (${os.arch()})`,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    totalRamMb: Math.round(os.totalmem() / (1024 * 1024)),
    results,
    stillCheck: {
      angle: angleBlank,
      swangle: swangleBlank,
      visualDiff,
    },
  };

  fs.writeFileSync(
    path.join(OUT_REVIEW_P0, 'benchmark-results.json'),
    JSON.stringify(summary, null, 2),
    'utf-8'
  );
  console.log('Benchmark complete. Saved to out/review/p0/benchmark-results.json');
}

runBenchmark().catch((err) => {
  console.error(err);
  process.exit(1);
});
