import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { renderMedia, selectComposition } from '@remotion/renderer';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { DeviceProfileName } from '@core/contracts/project';
import { StoryboardSchema } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { getProjectDir, loadProject, saveProject } from '@core/project/store';
import { clearRemotionBundleCache, getRemotionBundle } from '@core/qc/visual/runner';
import { syncGeneratedRegistry, type GeneratedCompMeta } from './scene-registry';

const execFileAsync = promisify(execFile);

const PROFILE_RENDER_OPTS: Record<DeviceProfileName, { gl: 'angle' | 'swangle'; concurrency: number }> = {
  hemat: { gl: 'swangle', concurrency: 2 },
  standar: { gl: 'angle', concurrency: 4 },
  penuh: { gl: 'angle', concurrency: 6 },
};

export interface PreviewRenderResult {
  previewPath: string;
  renderMs: number;
  videoDurationSec: number;
  voDurationSec: number;
}

/**
 * Assembles all generated scenes via <Series> into a project composition,
 * renders 720x1280 30fps MP4, and muxes raw VO (without BGM/SFX/normalization).
 */
export async function runPreviewRenderStage(
  projectId: string,
  repoRoot = process.cwd()
): Promise<PreviewRenderResult> {
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  project.stages.S11 = 'running';
  await saveProject(project, repoRoot);

  try {
    const safeSlug = projectId.replace(/[^a-zA-Z0-9-]/g, '-');
    const genDir = path.join(repoRoot, 'remotion', 'src', 'scenes', 'generated', safeSlug);
    const timeline = JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8')) as Timeline;
    const storyboard = StoryboardSchema.parse(
      JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8'))
    );

    const imports = storyboard.scenes
      .map((s) => {
        const exp = `Scene_${s.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        return `import { ${exp} } from './${s.id}';`;
      })
      .join('\n');

    const totalFrames = Math.max(30, Math.round(timeline.total_sec * 30));
    const seriesItems = storyboard.scenes
      .map((s, idx) => {
        const exp = `Scene_${s.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        const tlScene = timeline.scenes.find((ts) => ts.scene_id === s.id);
        const isLast = idx === storyboard.scenes.length - 1;
        const durSec = tlScene
          ? tlScene.end - tlScene.start + (isLast ? 0 : 0.25)
          : s.duration_sec;
        const frames = Math.max(15, Math.round(durSec * 30));
        return `      <Series.Sequence durationInFrames={${frames}}>\n        <${exp} telemetry={telemetry} />\n      </Series.Sequence>`;
      })
      .join('\n');

    const remotionPkg = 'remo' + 'tion';
    const assembledTsx = `import React from 'react';
import { Series } from '${remotionPkg}';
${imports}

export const AssembledVideo: React.FC<{ telemetry?: boolean }> = ({ telemetry = false }) => (
  <Series>
${seriesItems}
  </Series>
);
`;
    await writeFile(path.join(genDir, 'Assembled.tsx'), assembledTsx, 'utf-8');

    const metaPath = path.join(genDir, 'meta.json');
    const existingMetas = JSON.parse(await readFile(metaPath, 'utf-8')) as GeneratedCompMeta[];
    const assembledId = `gen-${safeSlug}-full`;
    const filtered = existingMetas.filter((m) => m.id !== assembledId);
    filtered.push({
      id: assembledId,
      importPath: './Assembled',
      exportName: 'AssembledVideo',
      durationInFrames: totalFrames,
    });
    await writeFile(metaPath, JSON.stringify(filtered, null, 2), 'utf-8');
    await syncGeneratedRegistry(repoRoot);
    clearRemotionBundleCache();

    const serveUrl = await getRemotionBundle(repoRoot);
    const composition = await selectComposition({
      serveUrl,
      id: assembledId,
      inputProps: { telemetry: false },
    });

    const rawVideoPath = path.join(projectDir, '_video_muted.mp4');
    const previewPath = path.join(projectDir, 'preview.mp4');
    const prof = PROFILE_RENDER_OPTS[project.device_profile];

    const t0 = Date.now();
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: rawVideoPath,
      inputProps: { telemetry: false },
      concurrency: prof.concurrency,
      chromiumOptions: { gl: prof.gl },
    });
    const renderMs = Date.now() - t0;

    const voFullPath = path.join(projectDir, 'audio', 'vo-full.mp3');
    await mkdir(path.dirname(previewPath), { recursive: true });
    await execFileAsync(ffmpegInstaller.path, [
      '-y',
      '-v',
      'error',
      '-i',
      rawVideoPath,
      '-i',
      voFullPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      previewPath,
    ]);
    await rm(rawVideoPath, { force: true }).catch(() => {});

    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S11 = 'done';
    await saveProject(updated, repoRoot);

    return {
      previewPath,
      renderMs,
      videoDurationSec: Number((totalFrames / 30).toFixed(2)),
      voDurationSec: timeline.total_sec,
    };
  } catch (err) {
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S11 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}
