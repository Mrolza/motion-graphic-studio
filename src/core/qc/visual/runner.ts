import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { DeviceProfileName } from '@core/contracts/project';
import {
  checkBlankFrames,
  checkFramingFromTelemetry,
  checkGeometryFromTelemetry,
  checkHudFormatFromTelemetry,
  checkHudOverlapFromTelemetry,
  checkMechanicsFromTelemetry,
  checkOnscreenTruthFromTelemetry,
  checkSyncFromTelemetry,
  checkVisibilityFromTelemetry,
} from './checks';
import type { TelemetrySample, VisualCheckSpec, VisualQcResult } from './types';

const execFileAsync = promisify(execFile);
const TELEMETRY_PREFIX = 'MGS_TELEMETRY ';

let cachedBundleDir: string | null = null;

const PROFILE_RENDER_OPTS: Record<DeviceProfileName, { gl: 'angle' | 'swangle'; concurrency: number }> = {
  hemat: { gl: 'swangle', concurrency: 2 },
  standar: { gl: 'angle', concurrency: 4 },
  penuh: { gl: 'angle', concurrency: 6 },
};

export function clearRemotionBundleCache(): void {
  cachedBundleDir = null;
}

export async function getRemotionBundle(repoRoot = process.cwd()): Promise<string> {
  if (cachedBundleDir) return cachedBundleDir;
  const entryPoint = path.join(repoRoot, 'remotion', 'src', 'index.ts');
  cachedBundleDir = await bundle({ entryPoint });
  return cachedBundleDir;
}

export async function runVisualQc(params: {
  spec: VisualCheckSpec;
  outputDir: string;
  videoOutPath?: string;
  inputProps?: Record<string, unknown>;
  sampleIntervalSec?: number;
  deviceProfile?: DeviceProfileName;
  repoRoot?: string;
}): Promise<VisualQcResult> {
  const {
    spec,
    outputDir,
    inputProps = {},
    sampleIntervalSec = 0.25,
    deviceProfile = 'standar',
    repoRoot = process.cwd(),
  } = params;

  await mkdir(outputDir, { recursive: true });
  const framesDir = path.join(outputDir, '_qc_frames');
  await rm(framesDir, { recursive: true, force: true }).catch(() => {});
  await mkdir(framesDir, { recursive: true });

  const serveUrl = await getRemotionBundle(repoRoot);
  const profile = PROFILE_RENDER_OPTS[deviceProfile];
  const videoPath = params.videoOutPath ?? path.join(outputDir, `${spec.compositionId}-telemetry.mp4`);
  const mergedProps = { ...inputProps, telemetry: true };

  const composition = await selectComposition({
    serveUrl,
    id: spec.compositionId,
    inputProps: mergedProps,
  });

  const telemetryByFrame = new Map<number, TelemetrySample>();
  const t0 = Date.now();
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: videoPath,
    inputProps: mergedProps,
    concurrency: profile.concurrency,
    chromiumOptions: { gl: profile.gl },
    onBrowserLog: (log) => {
      if (log.text.includes('THREE.Clock') && log.text.includes('deprecated')) {
        return;
      }
      if (log.text.startsWith(TELEMETRY_PREFIX)) {
        try {
          const parsed = JSON.parse(log.text.slice(TELEMETRY_PREFIX.length)) as TelemetrySample;
          telemetryByFrame.set(parsed.frame, parsed);
        } catch {
          // ignore malformed log line
        }
      }
    },
  });
  const renderMs = Date.now() - t0;

  // Sample every 0.25s
  const stepFrames = Math.max(1, Math.round(sampleIntervalSec * composition.fps));
  const sampledFrames: TelemetrySample[] = [];
  for (let f = 0; f < composition.durationInFrames; f += stepFrames) {
    const sample = telemetryByFrame.get(f);
    if (sample) sampledFrames.push(sample);
  }

  // Extract sampled PNG frames at 1 / sampleIntervalSec fps for blank frame check
  await execFileAsync(ffmpegInstaller.path, [
    '-y',
    '-v',
    'error',
    '-i',
    videoPath,
    '-vf',
    `fps=${1 / sampleIntervalSec}`,
    path.join(framesDir, 'sample-%03d.png'),
  ]);
  const pngPaths = (await readdir(framesDir))
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => path.join(framesDir, f));

  const mechanicsIssues = checkMechanicsFromTelemetry(sampledFrames, spec);
  const geometryIssues = checkGeometryFromTelemetry(sampledFrames, spec);
  const visibilityIssues = checkVisibilityFromTelemetry(sampledFrames, spec);
  const framingIssues = checkFramingFromTelemetry(sampledFrames, spec);
  const hudOverlapIssues = checkHudOverlapFromTelemetry(sampledFrames, spec);
  const hudFormatIssues = checkHudFormatFromTelemetry(sampledFrames);
  const onscreenTruthIssues = checkOnscreenTruthFromTelemetry(sampledFrames, spec);
  const syncIssues = checkSyncFromTelemetry(sampledFrames, spec);
  const blankIssues = await checkBlankFrames(pngPaths);

  await rm(framesDir, { recursive: true, force: true }).catch(() => {});

  const reports = {
    mechanics: { layer: 'L5' as const, issues: mechanicsIssues },
    geometry: { layer: 'L5' as const, issues: geometryIssues },
    visibility: { layer: 'L5' as const, issues: visibilityIssues },
    framing: { layer: 'L5' as const, issues: framingIssues },
    hudOverlap: { layer: 'L5' as const, issues: hudOverlapIssues },
    hudFormat: { layer: 'L5' as const, issues: hudFormatIssues },
    onscreenTruth: { layer: 'L5' as const, issues: onscreenTruthIssues },
    sync: { layer: 'L5' as const, issues: syncIssues },
    blank: { layer: 'L5' as const, issues: blankIssues },
  };

  const allIssues = [
    ...mechanicsIssues,
    ...geometryIssues,
    ...visibilityIssues,
    ...framingIssues,
    ...hudOverlapIssues,
    ...hudFormatIssues,
    ...onscreenTruthIssues,
    ...syncIssues,
    ...blankIssues,
  ];
  const passed = !allIssues.some((i) => i.severity === 'error');

  const result: VisualQcResult = {
    compositionId: spec.compositionId,
    passed,
    sampleCount: sampledFrames.length,
    renderMs,
    reports,
  };

  await writeFile(
    path.join(outputDir, `${spec.compositionId}-qc.json`),
    JSON.stringify(result, null, 2),
    'utf-8'
  );
  await writeFile(
    path.join(outputDir, `${spec.compositionId}-telemetry.json`),
    JSON.stringify(sampledFrames, null, 2),
    'utf-8'
  );

  return result;
}
