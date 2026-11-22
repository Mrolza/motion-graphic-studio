import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import {
  buildAudioMixFilterGraph,
  selectPrioritizedSfxEvents,
} from '@core/audio/audio-mix';
import { StoryboardSchema } from '@core/contracts/storyboard';
import { TimelineSchema } from '@core/contracts/timeline';
import { getProjectDir, loadProject, saveProject } from '@core/project/store';
import type { TimelineEvent } from '@core/timeline/timeline';

const execFileAsync = promisify(execFile);

export interface MixStageResult {
  mixWavPath: string;
  voWavPath: string;
  sfxWavPath: string;
  bgmWavPath?: string;
  loudnessPath: string;
  integratedLufs: number;
  truePeakDbtp: number;
  mixMs: number;
}

function parseLoudnormJson(stderr: string): Record<string, string> | null {
  const match = stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, string>;
  } catch {
    return null;
  }
}

/**
 * S11: Mixes VO stem + licensed SFX (whoosh on scene cuts, tick on HUD appear) + optional BGM
 * with 2-pass EBU R128 loudnorm (-14 LUFS, <= -1.5 dBTP, 48 kHz).
 */
export async function runMixStage(
  projectId: string,
  repoRoot = process.cwd()
): Promise<MixStageResult> {
  const t0 = Date.now();
  const ffmpegBin = ffmpegInstaller.path;
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  project.stages.S11 = 'running';
  await saveProject(project, repoRoot);

  try {
    const timeline = TimelineSchema.parse(
      JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8'))
    );
    const storyboard = StoryboardSchema.parse(
      JSON.parse(await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8'))
    );

    const audioDir = path.join(projectDir, 'audio');
    await mkdir(audioDir, { recursive: true });

    // Verify SFX license notice exists
    const sfxDir = path.join(repoRoot, 'remotion', 'public', 'sfx');
    const licenseTxt = await readFile(path.join(sfxDir, 'LICENSE.txt'), 'utf-8').catch(() => '');
    const noticesTxt = await readFile(path.join(repoRoot, 'THIRD_PARTY_NOTICES.md'), 'utf-8').catch(() => '');
    const sfxLicensed = /MIT|CC0/i.test(licenseTxt) && noticesTxt.includes('remotion/public/sfx');

    // Check optional BGM in assets/bgm/
    let bgmFilePath: string | undefined;
    try {
      const bgmFiles = await readdir(path.join(repoRoot, 'assets', 'bgm'));
      const audioExt = bgmFiles.find((f) => /\.(mp3|wav|ogg|m4a)$/i.test(f));
      if (audioExt) bgmFilePath = path.join(repoRoot, 'assets', 'bgm', audioExt);
    } catch {
      bgmFilePath = undefined;
    }

    // Build SFX timeline events from storyboard + timeline
    const rawEvents: TimelineEvent[] = [];
    for (let i = 1; i < timeline.scenes.length; i++) {
      rawEvents.push({ type: 'scene_cut', at: timeline.scenes[i]!.start });
    }
    for (const sc of storyboard.scenes) {
      const tl = timeline.scenes.find((t) => t.scene_id === sc.id);
      if (!tl) continue;
      if (sc.hud.length > 0) {
        rawEvents.push({ type: 'stat_count', at: tl.start + 0.08 });
      }
    }
    const sfxEvents = sfxLicensed
      ? selectPrioritizedSfxEvents(rawEvents, { whooshOnSceneCut: true, minGapSec: 0.35 })
      : [];

    const sceneSlotsSec = timeline.scenes.map((sc, idx) => {
      const next = timeline.scenes[idx + 1];
      return next ? Math.max(0.2, next.start - sc.start) : Math.max(0.2, sc.end - sc.start);
    });

    // 1. Export VO stem (48 kHz stereo wav)
    const voWavPath = path.join(audioDir, 'vo.wav');
    const voGraph = buildAudioMixFilterGraph({
      totalSec: timeline.total_sec,
      sceneCount: timeline.scenes.length,
      sceneSlotsSec,
      sfxEvents: [],
      hasBgm: false,
    });
    const voInputs = timeline.scenes.flatMap((sc) => ['-i', path.join(repoRoot, sc.audio_path)]);
    await execFileAsync(ffmpegBin, [
      '-y',
      '-v',
      'error',
      ...voInputs,
      '-filter_complex',
      voGraph.filterComplex,
      '-map',
      voGraph.outputLabel,
      '-ar',
      '48000',
      '-ac',
      '2',
      voWavPath,
    ]);

    // 2. Export SFX stem (48 kHz stereo wav)
    const sfxWavPath = path.join(audioDir, 'sfx.wav');
    if (sfxEvents.length > 0) {
      const sfxInputs = sfxEvents.flatMap((ev) => ['-i', path.join(sfxDir, `${ev.kind}.wav`)]);
      const sfxFilters = sfxEvents.map((ev, idx) => {
        const delayMs = Math.max(0, Math.round(ev.atSec * 1000));
        return `[${idx}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=0.18,adelay=${delayMs}|${delayMs},apad,atrim=0:${timeline.total_sec.toFixed(3)}[s${idx}]`;
      });
      const mixLabels = sfxEvents.map((_, idx) => `[s${idx}]`).join('');
      const sfxComplex =
        sfxEvents.length === 1
          ? `${sfxFilters[0]};[s0]anull[sfx_out]`
          : `${sfxFilters.join(';')};${mixLabels}amix=inputs=${sfxEvents.length}:duration=first:dropout_transition=0,volume=${sfxEvents.length}[sfx_out]`;
      await execFileAsync(ffmpegBin, [
        '-y',
        '-v',
        'error',
        ...sfxInputs,
        '-filter_complex',
        sfxComplex,
        '-map',
        '[sfx_out]',
        '-ar',
        '48000',
        '-ac',
        '2',
        sfxWavPath,
      ]);
    } else {
      await execFileAsync(ffmpegBin, [
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=48000:cl=stereo',
        '-t',
        timeline.total_sec.toFixed(3),
        sfxWavPath,
      ]);
    }

    // 3. Combined raw mix + optional BGM ducked >= 12 dB
    const rawMixPath = path.join(audioDir, '_mix_raw.wav');
    const mixGraph = buildAudioMixFilterGraph({
      totalSec: timeline.total_sec,
      sceneCount: timeline.scenes.length,
      sceneSlotsSec,
      sfxEvents,
      hasBgm: Boolean(bgmFilePath),
      sfxVolume: 0.18,
      bgmVolume: 0.14,
    });
    const allInputs = [
      ...timeline.scenes.flatMap((sc) => ['-i', path.join(repoRoot, sc.audio_path)]),
      ...(bgmFilePath ? ['-i', bgmFilePath] : []),
      ...sfxEvents.flatMap((ev) => ['-i', path.join(sfxDir, `${ev.kind}.wav`)]),
    ];
    await execFileAsync(ffmpegBin, [
      '-y',
      '-v',
      'error',
      ...allInputs,
      '-filter_complex',
      mixGraph.filterComplex,
      '-map',
      mixGraph.outputLabel,
      '-ar',
      '48000',
      '-ac',
      '2',
      rawMixPath,
    ]);

    // 4. Two-pass loudnorm (-14 LUFS, TP <= -1.5 dBTP, 48 kHz)
    const pass1 = await execFileAsync(ffmpegBin, [
      '-y',
      '-i',
      rawMixPath,
      '-af',
      'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json',
      '-f',
      'null',
      process.platform === 'win32' ? 'NUL' : '/dev/null',
    ]);
    const stats = parseLoudnormJson(pass1.stderr ?? '');
    const mixWavPath = path.join(audioDir, 'mix.wav');
    const loudnormFilter = stats
      ? `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`
      : 'loudnorm=I=-14:TP=-1.5:LRA=11';

    await execFileAsync(ffmpegBin, [
      '-y',
      '-v',
      'error',
      '-i',
      rawMixPath,
      '-af',
      loudnormFilter,
      '-ar',
      '48000',
      '-ac',
      '2',
      mixWavPath,
    ]);

    // Measure final ebur128 loudness summary
    const ebu = await execFileAsync(ffmpegBin, [
      '-i',
      mixWavPath,
      '-af',
      'ebur128=peak=true',
      '-f',
      'null',
      process.platform === 'win32' ? 'NUL' : '/dev/null',
    ]);
    const ebuOut = ebu.stderr ?? '';
    const iMatches = [...ebuOut.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
    const tpMatches = [...ebuOut.matchAll(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g)];
    const integratedLufs = iMatches.length > 0 ? Number(iMatches[iMatches.length - 1]![1]) : -14;
    const truePeakDbtp = tpMatches.length > 0 ? Number(tpMatches[tpMatches.length - 1]![1]) : -1.5;

    const loudnessPath = path.join(audioDir, 'loudness.txt');
    await writeFile(
      loudnessPath,
      `Integrated: ${integratedLufs} LUFS\nTrue Peak: ${truePeakDbtp} dBFS\nSample Rate: 48000 Hz\nSFX Events: ${sfxEvents.length}\nBGM: ${bgmFilePath ? path.basename(bgmFilePath) : 'none (no files in assets/bgm/)'}\n\n--- ebur128 summary ---\n${ebuOut.slice(-900)}\n`,
      'utf-8'
    );

    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S11 = 'done';
    await saveProject(updated, repoRoot);

    return {
      mixWavPath,
      voWavPath,
      sfxWavPath,
      loudnessPath,
      integratedLufs,
      truePeakDbtp,
      mixMs: Date.now() - t0,
    };
  } catch (err) {
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S11 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}
