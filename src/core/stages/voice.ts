import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import {
  synthesizeSceneFromSentenceCache,
  type SentenceManifest,
  type SynthesizeSentenceFn,
} from '@core/audio/sentence-tts-cache';
import { type VoiceId } from '@core/audio/tts';
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
  reusedSentenceRefs: string[];
  synthesizedSentenceRefs: string[];
}

/**
 * S5: Synthesizes raw id-ID voice-over per sentence (with hash cache) & per scene, and builds timeline.json.
 */
export async function runVoiceStage(
  projectId: string,
  options?: {
    voice?: VoiceId;
    repoRoot?: string;
    synthesizeSentenceFn?: SynthesizeSentenceFn;
    skipTighten?: boolean;
  }
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

    const voiceId: VoiceId = options?.voice ?? 'id-ID-ArdiNeural';
    const audioDir = path.join(projectDir, 'audio');
    await mkdir(audioDir, { recursive: true });
    const manifestPath = path.join(audioDir, 'sentences', 'manifest.json');
    let manifest: SentenceManifest = {};
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as SentenceManifest;
    } catch {
      manifest = {};
    }

    const sceneAudioPaths: Record<string, string> = {};
    const timelineScenes: Array<{
      scene_id: string;
      audio_path: string;
      duration_sec: number;
      words: Awaited<ReturnType<typeof synthesizeSceneFromSentenceCache>>['words'];
    }> = [];
    const sceneEngines: Array<{ scene_id: string; engine_used: string; voice_id: VoiceId }> = [];
    const reusedSentenceRefs: string[] = [];
    const synthesizedSentenceRefs: string[] = [];

    for (const sc of updatedScenes) {
      const sentItems = sc.sentences.map((s, idx) => ({
        ref: `${sc.id}.${idx + 1}`,
        spokenText: s.spoken_text,
      }));
      const scRes = await synthesizeSceneFromSentenceCache({
        sceneId: sc.id,
        sentences: sentItems,
        voice: voiceId,
        audioDir,
        repoRoot,
        manifest,
        synthesizeSentenceFn: options?.synthesizeSentenceFn,
      });
      reusedSentenceRefs.push(...scRes.reusedRefs);
      synthesizedSentenceRefs.push(...scRes.synthesizedRefs);

      const destRel = `projects/${projectId}/audio/${sc.id}.mp3`;
      sceneAudioPaths[sc.id] = destRel;
      sceneEngines.push({ scene_id: sc.id, engine_used: scRes.engine_used, voice_id: voiceId });
      timelineScenes.push({
        scene_id: sc.id,
        audio_path: destRel,
        duration_sec: scRes.duration_sec,
        words: scRes.words,
      });
    }

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

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
    await writeFile(
      path.join(audioDir, 'tts-manifest.json'),
      JSON.stringify(sceneEngines, null, 2),
      'utf-8'
    );

    const finalTimeline = options?.skipTighten
      ? timeline
      : (
          await tightenProjectVoice({
            projectId,
            projectDir,
            timeline,
            repoRoot,
          })
        ).timeline;

    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S5 = 'done';
    await saveProject(updated, repoRoot);

    return {
      timeline: finalTimeline,
      voFullPath,
      sceneAudioPaths,
      reusedSentenceRefs,
      synthesizedSentenceRefs,
    };
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
  if (res.timeline.total_sec < 30.2 && res.timeline.scenes.length > 0) {
    const targetSec = 30.35;
    const tempo = Number((res.timeline.total_sec / targetSec).toFixed(4));
    const scale = 1 / tempo;
    for (const sc of res.timeline.scenes) {
      const mp3Disk = path.join(repoRoot, sc.audio_path);
      const tmpDisk = `${mp3Disk}.tmp.mp3`;
      await execFileAsync(ffmpegInstaller.path, [
        '-y',
        '-v',
        'error',
        '-i',
        mp3Disk,
        '-filter:a',
        `atempo=${tempo}`,
        tmpDisk,
      ]);
      await copyFile(tmpDisk, mp3Disk);
      await rm(tmpDisk, { force: true });
      sc.start = Number((sc.start * scale).toFixed(3));
      sc.end = Number((sc.end * scale).toFixed(3));
    }
    for (const w of res.timeline.words) {
      w.start = Number((w.start * scale).toFixed(3));
      w.end = Number((w.end * scale).toFixed(3));
    }
    res.timeline.total_sec = Number((res.timeline.total_sec * scale).toFixed(3));
    await writeFile(path.join(projectDir, 'timeline.json'), JSON.stringify(res.timeline, null, 2), 'utf-8');
  }
  const updated = await loadProject(projectId, repoRoot);
  updated.stages.S5 = 'done';
  await saveProject(updated, repoRoot);
  return res;
}
