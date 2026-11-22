import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { synthesizeScenesVoiceOver, type VoiceId } from '@core/audio/tts';
import { ScriptSchema, type Script } from '@core/contracts/script';
import { TimelineSchema, type Timeline } from '@core/contracts/timeline';
import { getProjectDir, loadProject, saveProject } from '@core/project/store';
import { buildTimeline } from '@core/timeline/timeline';
import { tightenProjectVoice, type TightenVoResult } from '@core/audio/vo-tighten';

const execFileAsync = promisify(execFile);

/**
 * Converts display script text into TTS-friendly Indonesian spoken text
 * (e.g. "1:20" -> "1 banding 20", "3,5" -> "3 koma 5", "1.435" -> "1435", "720°" -> "720 derajat").
 */
export function toIndonesianSpokenText(text: string): string {
  return text
    .replace(/\b(\d+)\s*:\s*(\d+)\b/g, '$1 banding $2')
    .replace(/(\d+)\s*°/g, '$1 derajat')
    .replace(/\b(\d{1,3}(?:\.\d{3})+)\b/g, (m) => m.replace(/\./g, ''))
    .replace(/\b(\d+),(\d+)\b/g, '$1 koma $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface VoiceStageResult {
  timeline: Timeline;
  voFullPath: string;
  sceneAudioPaths: Record<string, string>;
}

/**
 * S5: Synthesizes raw id-ID voice-over per scene using msedge-tts and builds timeline.json.
 */
export async function runVoiceStage(
  projectId: string,
  options?: { voice?: VoiceId; repoRoot?: string }
): Promise<VoiceStageResult> {
  const repoRoot = options?.repoRoot ?? process.cwd();
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  if (project.stages.S4 !== 'done') {
    throw new Error(`Project "${projectId}" must pass Gate 1 (S4=done) before running voice stage.`);
  }

  project.stages.S5 = 'running';
  await saveProject(project, repoRoot);

  try {
    const scriptRaw = JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8'));
    const script: Script = ScriptSchema.parse(scriptRaw);

    const updatedScenes = script.scenes.map((sc) => ({
      ...sc,
      sentences: sc.sentences.map((s) => ({
        ...s,
        spoken_text: s.spoken_text ?? toIndonesianSpokenText(s.text),
      })),
    }));

    const ttsScenes = updatedScenes.map((sc, idx) => ({
      scene_number: idx + 1,
      narration: sc.sentences.map((s) => s.spoken_text).join(' '),
    }));

    const ttsRes = await synthesizeScenesVoiceOver({
      scenes: ttsScenes,
      voice: options?.voice ?? 'id-ID-ArdiNeural',
    });

    const audioDir = path.join(projectDir, 'audio');
    await mkdir(audioDir, { recursive: true });

    const sceneAudioPaths: Record<string, string> = {};
    const timelineScenes: Array<{
      scene_id: string;
      audio_path: string;
      duration_sec: number;
      words: typeof ttsRes.audioAssets[number]['words'];
    }> = [];

    for (let i = 0; i < updatedScenes.length; i++) {
      const sc = updatedScenes[i]!;
      const asset = ttsRes.audioAssets[i]!;
      const srcDisk = path.join(repoRoot, asset.local_file_path);
      const destRel = `projects/${projectId}/audio/${sc.id}.mp3`;
      const destDisk = path.join(audioDir, `${sc.id}.mp3`);
      await copyFile(srcDisk, destDisk);
      await rm(srcDisk, { force: true }).catch(() => {});
      sceneAudioPaths[sc.id] = destRel;

      timelineScenes.push({
        scene_id: sc.id,
        audio_path: destRel,
        duration_sec: asset.duration_sec,
        words: asset.words,
      });
    }

    const sceneGapSec = 0.25;
    const rawTimeline = buildTimeline({
      scenes: timelineScenes,
      beats: [],
      sceneGapSec,
      maxShotSec: 3.0,
    });
    const timeline = TimelineSchema.parse(rawTimeline);

    // Concatenate raw VO with exact 0.25s silence gaps between scenes
    const voFullPath = path.join(audioDir, 'vo-full.mp3');
    const silencePath = path.join(audioDir, '_gap.mp3');
    await execFileAsync(ffmpegInstaller.path, [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=24000:cl=mono',
      '-t',
      String(sceneGapSec),
      '-q:a',
      '4',
      silencePath,
    ]);

    const concatInputs: string[] = [];
    for (let i = 0; i < updatedScenes.length; i++) {
      concatInputs.push(path.join(audioDir, `${updatedScenes[i]!.id}.mp3`));
      if (i < updatedScenes.length - 1) concatInputs.push(silencePath);
    }
    const listFile = path.join(audioDir, '_concat.txt');
    await writeFile(
      listFile,
      concatInputs.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
      'utf-8'
    );
    await execFileAsync(ffmpegInstaller.path, [
      '-y',
      '-v',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c:a',
      'libmp3lame',
      '-q:a',
      '4',
      voFullPath,
    ]);
    await rm(silencePath, { force: true }).catch(() => {});
    await rm(listFile, { force: true }).catch(() => {});

    await writeFile(
      path.join(projectDir, 'script.json'),
      JSON.stringify({ scenes: updatedScenes }, null, 2),
      'utf-8'
    );
    await writeFile(
      path.join(projectDir, 'timeline.json'),
      JSON.stringify(timeline, null, 2),
      'utf-8'
    );

    const tightened = await tightenProjectVoice({
      projectId,
      projectDir,
      timeline,
      repoRoot,
    });

    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S5 = 'done';
    await saveProject(updated, repoRoot);

    return { timeline: tightened.timeline, voFullPath, sceneAudioPaths };
  } catch (err) {
    const failed = await loadProject(projectId, repoRoot);
    failed.stages.S5 = 'failed';
    await saveProject(failed, repoRoot);
    throw err;
  }
}

/**
 * Tightens existing VO audio pauses (> 0.4s) without re-running TTS.
 */
export async function tightenExistingVoiceStage(
  projectId: string,
  repoRoot = process.cwd()
): Promise<TightenVoResult> {
  const projectDir = getProjectDir(projectId, repoRoot);
  const timeline = TimelineSchema.parse(
    JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8'))
  );
  const res = await tightenProjectVoice({ projectId, projectDir, timeline, repoRoot });
  const updated = await loadProject(projectId, repoRoot);
  updated.stages.S5 = 'done';
  await saveProject(updated, repoRoot);
  return res;
}
