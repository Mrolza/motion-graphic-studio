import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { renderMedia, selectComposition } from '@remotion/renderer';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { DeviceProfileName } from '@core/contracts/project';
import type { Script } from '@core/contracts/script';
import { getHudClaimRefs, StoryboardSchema } from '@core/contracts/storyboard';
import { TimelineSchema } from '@core/contracts/timeline';
import { getProjectDir, loadProject, saveProject } from '@core/project/store';
import { extractHudDisplayText, type L5SemanticVerdict } from '@core/qc/l5-semantic';
import type { TelemetrySample } from '@core/qc/visual/types';
import { clearRemotionBundleCache, getRemotionBundle } from '@core/qc/visual/runner';
import { buildKineticCaptions, captionsToSrt } from '@core/render/kinetic-captions';
import { syncGeneratedRegistry, type GeneratedCompMeta } from './scene-registry';

const execFileAsync = promisify(execFile);

const PROFILE_OPTS: Record<
  DeviceProfileName,
  { gl: 'angle' | 'swangle'; concurrency: number; chunkFrames: number }
> = {
  hemat: { gl: 'swangle', concurrency: 2, chunkFrames: 150 },
  standar: { gl: 'angle', concurrency: 4, chunkFrames: 180 },
  penuh: { gl: 'angle', concurrency: 6, chunkFrames: 240 },
};

export interface FinalRenderResult {
  finalPath: string;
  captionsSrtPath: string;
  onscreenTextPath: string;
  profile: DeviceProfileName;
  encoder: string;
  totalFrames: number;
  chunksCount: number;
  chunksSkipped: number;
  renderMs: number;
  concatMs: number;
  muxMs: number;
}

async function probeFrameCount(mp4Path: string): Promise<number> {
  try {
    await stat(mp4Path);
    const { stdout } = await execFileAsync(ffprobeInstaller.path, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-count_frames',
      '-show_entries',
      'stream=nb_read_frames',
      '-of',
      'csv=p=0',
      mp4Path,
    ]);
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * S10: Builds Assembled.tsx with <KineticCaptions>, renders silent video in chunks,
 * skips valid existing chunks, concatenates via ffmpeg, and muxes audio/mix.wav once.
 */
export async function runFinalRenderStage(
  projectId: string,
  options?: { profile?: DeviceProfileName; repoRoot?: string }
): Promise<FinalRenderResult> {
  const repoRoot = options?.repoRoot ?? process.cwd();
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  const profile = options?.profile ?? project.device_profile ?? 'standar';
  const opts = PROFILE_OPTS[profile];

  project.stages.S10 = 'running';
  await saveProject(project, repoRoot);

  try {
    const safeSlug = projectId.replace(/[^a-zA-Z0-9-]/g, '-');
    const genDir = path.join(repoRoot, 'remotion', 'src', 'scenes', 'generated', safeSlug);
    const timeline = TimelineSchema.parse(
      JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8'))
    );
    const script = JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8')) as Script;
    const ledger = JSON.parse(await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
    const storyboard = StoryboardSchema.parse(
      JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8'))
    );

    const semanticVerdicts: L5SemanticVerdict[] = JSON.parse(
      await readFile(path.join(projectDir, 'qc', 'l5-semantic.json'), 'utf-8').catch(() => '[]')
    );
    const semanticMap = new Map(semanticVerdicts.map((v) => [v.hud_id, v]));

    // Build kinetic captions & SRT
    const captionChunks = buildKineticCaptions(script, timeline);
    const captionsSrtPath = path.join(projectDir, 'captions.srt');
    await writeFile(captionsSrtPath, captionsToSrt(captionChunks), 'utf-8');
    await writeFile(path.join(projectDir, 'captions.json'), JSON.stringify(captionChunks, null, 2), 'utf-8');

    // Write onscreen-text.md with semantic verdict per HUD item
    const claimMap = new Map(ledger.claims.map((c) => [c.id, c]));
    const rows: string[] = [];
    for (const s of storyboard.scenes) {
      s.hud.forEach((h, hIdx) => {
        const hid = h.hud_id ?? `${s.id}_H${hIdx + 1}`;
        const p = h.props ?? {};
        const txt = extractHudDisplayText(p);
        const claimRefs = getHudClaimRefs(h);
        const claims = claimRefs
          .map((cid) => claimMap.get(cid))
          .filter((c): c is NonNullable<typeof c> => Boolean(c));
        const claimCell = h.bind_to_driver || p.bind_to_driver
          ? `driver:${s.driver?.name ?? 'driver'} (${h.display ?? 'value'})`
          : claimRefs.length > 0
            ? claimRefs.join(', ')
            : h.illustrative
              ? 'illustrative'
              : '-';
        const quoteCell =
          claims.length > 0
            ? claims
                .map((c) => c.sources[0]?.quote)
                .filter(Boolean)
                .map((q) => `"${q}"`)
                .join(' | ') || '-'
            : '-';
        const sem = semanticMap.get(hid);
        const semCell = sem ? `${sem.verdict}${sem.code ? ` (${sem.code})` : ''}: ${sem.reason}` : 'OK';
        rows.push(`| ${s.id} | ${hid} | ${h.component} | ${txt} | ${claimCell} | ${quoteCell} | ${semCell} |`);
      });
    }
    const onscreenTextPath = path.join(projectDir, 'onscreen-text.md');
    await writeFile(
      onscreenTextPath,
      `# Teks di Layar (${projectId})\n\n| Adegan | hud_id | Komponen | Teks | Klaim / Driver | Kutipan Sumber | Putusan Semantik (L5) |\n|---|---|---|---|---|---|---|\n${rows.join(
        '\n'
      )}\n`,
      'utf-8'
    );

    // Build Assembled.tsx with <Series> + <KineticCaptions>
    const totalFrames = Math.max(30, Math.round(timeline.total_sec * 30));
    const imports = storyboard.scenes
      .map((s) => `import { Scene_${s.id.replace(/[^a-zA-Z0-9]/g, '')} } from './${s.id}';`)
      .join('\n');

    let remaining = totalFrames;
    const seriesItems = storyboard.scenes
      .map((s, idx) => {
        const exp = `Scene_${s.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        const tlScene = timeline.scenes.find((ts) => ts.scene_id === s.id);
        const isLast = idx === storyboard.scenes.length - 1;
        const durSec = tlScene
          ? tlScene.end - tlScene.start + (isLast ? 0 : 0.22)
          : s.duration_sec;
        const frames = isLast ? Math.max(15, remaining) : Math.max(15, Math.round(durSec * 30));
        remaining -= frames;
        const hudData = JSON.stringify(
          s.hud.map((h, hIdx) => ({ ...h, hud_id: h.hud_id ?? `${s.id}_H${hIdx + 1}` }))
        );
        return `      <Series.Sequence durationInFrames={${frames}}>\n        <${exp} telemetry={telemetry} hudData={${hudData}} />\n      </Series.Sequence>`;
      })
      .join('\n');

    const remotionPkg = 'remotion';
    const assembledTsx = `import React from 'react';
import { AbsoluteFill, Series, useCurrentFrame, useVideoConfig } from '${remotionPkg}';
import { KineticCaptions, TelemetryEmitter, TelemetryProvider } from '../../../kit';
${imports}

const CAPTION_CHUNKS = ${JSON.stringify(captionChunks)};

const AssembledTelemetryEmitter: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <TelemetryEmitter frame={frame} fps={fps} />;
};

export const AssembledProject: React.FC<{ telemetry?: boolean }> = ({ telemetry = false }) => (
  <TelemetryProvider enabled={telemetry}>
    <AbsoluteFill style={{ backgroundColor: '#0A192F' }}>
      <Series>
${seriesItems}
      </Series>
      <KineticCaptions chunks={CAPTION_CHUNKS} palette="blueprint-navy" />
      {telemetry ? <AssembledTelemetryEmitter /> : null}
    </AbsoluteFill>
  </TelemetryProvider>
);
`;
    const assembledPath = path.join(genDir, 'Assembled.tsx');
    const prevAssembled = await readFile(assembledPath, 'utf-8').catch(() => '');
    const assembledChanged = prevAssembled !== assembledTsx;
    await writeFile(assembledPath, assembledTsx, 'utf-8');

    const assembledId = `gen-${safeSlug}-assembled`;
    const metaPath = path.join(genDir, 'meta.json');
    const existingMetas = JSON.parse(await readFile(metaPath, 'utf-8')) as GeneratedCompMeta[];
    const filtered = existingMetas.filter((m) => m.id !== assembledId);
    filtered.push({
      id: assembledId,
      importPath: './Assembled',
      exportName: 'AssembledProject',
      durationInFrames: totalFrames,
    });
    await writeFile(metaPath, JSON.stringify(filtered, null, 2), 'utf-8');
    await syncGeneratedRegistry(repoRoot);
    clearRemotionBundleCache();

    // Render silent chunks
    const tRender0 = Date.now();
    const serveUrl = await getRemotionBundle(repoRoot);
    const composition = await selectComposition({
      serveUrl,
      id: assembledId,
      inputProps: { telemetry: true },
    });
    const chunksDir = path.join(projectDir, 'chunks');
    const telemetrySamplesPath = path.join(projectDir, 'telemetry-samples.json');
    const hasTelemetry = await stat(telemetrySamplesPath).then(() => true).catch(() => false);
    if (assembledChanged || !hasTelemetry) {
      await rm(chunksDir, { recursive: true, force: true });
    }
    await mkdir(chunksDir, { recursive: true });

    const chunkPaths: string[] = [];
    let chunksSkipped = 0;
    const telemetryByFrame = new Map<number, TelemetrySample>();
    const TELEMETRY_PREFIX = 'MGS_TELEMETRY ';
    for (let startF = 0, idx = 0; startF < totalFrames; startF += opts.chunkFrames, idx++) {
      const endF = Math.min(totalFrames - 1, startF + opts.chunkFrames - 1);
      const expectedFrames = endF - startF + 1;
      const chunkPath = path.join(chunksDir, `chunk-${String(idx).padStart(3, '0')}.mp4`);
      chunkPaths.push(chunkPath);

      const existingFrames = await probeFrameCount(chunkPath);
      if (existingFrames === expectedFrames) {
        chunksSkipped++;
        continue;
      }
      await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        pixelFormat: 'yuv420p',
        outputLocation: chunkPath,
        inputProps: { telemetry: true },
        frameRange: [startF, endF],
        muted: true,
        concurrency: opts.concurrency,
        chromiumOptions: { gl: opts.gl },
        onBrowserLog: (log) => {
          if (log.text.startsWith(TELEMETRY_PREFIX)) {
            try {
              const parsed = JSON.parse(log.text.slice(TELEMETRY_PREFIX.length)) as TelemetrySample;
              telemetryByFrame.set(parsed.frame, parsed);
            } catch {
              // ignore malformed telemetry
            }
          }
        },
      });
    }
    if (telemetryByFrame.size > 0) {
      const sortedTelemetry = [...telemetryByFrame.values()]
        .sort((a, b) => a.frame - b.frame)
        .filter((s, idx) => idx === 0 || s.frame % 5 === 0);
      await writeFile(
        path.join(projectDir, 'telemetry-samples.json'),
        JSON.stringify(sortedTelemetry, null, 2),
        'utf-8'
      );
    }
    const renderMs = Date.now() - tRender0;

    // Concat chunks
    const tConcat0 = Date.now();
    const concatListPath = path.join(chunksDir, '_concat.txt');
    await writeFile(
      concatListPath,
      chunkPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
      'utf-8'
    );
    const silentConcatPath = path.join(chunksDir, 'video-silent.mp4');
    await execFileAsync(ffmpegInstaller.path, [
      '-y',
      '-v',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-c',
      'copy',
      silentConcatPath,
    ]);
    const concatMs = Date.now() - tConcat0;

    // Mux mix.wav once
    const tMux0 = Date.now();
    const mixWavPath = path.join(projectDir, 'audio', 'mix.wav');
    const finalPath = path.join(projectDir, 'final.mp4');
    const exactDur = (totalFrames / 30).toFixed(3);
    await execFileAsync(ffmpegInstaller.path, [
      '-y',
      '-v',
      'error',
      '-i',
      silentConcatPath,
      '-i',
      mixWavPath,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'fast',
      '-crf',
      '18',
      '-c:a',
      'aac',
      '-ar',
      '48000',
      '-b:a',
      '192k',
      '-t',
      exactDur,
      finalPath,
    ]);
    const muxMs = Date.now() - tMux0;

    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S10 = 'done';
    await saveProject(updated, repoRoot);

    return {
      finalPath,
      captionsSrtPath,
      onscreenTextPath,
      profile,
      encoder: 'libx264 (Remotion default)',
      totalFrames,
      chunksCount: chunkPaths.length,
      chunksSkipped,
      renderMs,
      concatMs,
      muxMs,
    };
  } catch (err) {
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S10 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}
