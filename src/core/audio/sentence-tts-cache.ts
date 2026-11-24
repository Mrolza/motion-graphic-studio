import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import {
  probeMp3DurationSec,
  synthesizeScenesVoiceOver,
  type VoiceId,
  type WordTiming,
} from '@core/audio/tts';

const execFileAsync = promisify(execFile);

export interface SentenceCacheEntry {
  ref: string;
  text_hash: string;
  audio_sha256: string;
  duration_sec: number;
  words: WordTiming[];
  engine_used: string;
  voice_id: VoiceId;
}

export type SentenceManifest = Record<string, SentenceCacheEntry>;

export type SynthesizeSentenceFn = (params: {
  ref: string;
  text: string;
  voice: VoiceId;
  destDisk: string;
  repoRoot: string;
}) => Promise<{ duration_sec: number; words: WordTiming[]; engine_used: string }>;

function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

async function defaultSynthesizeSentence(params: {
  ref: string;
  text: string;
  voice: VoiceId;
  destDisk: string;
  repoRoot: string;
}): Promise<{ duration_sec: number; words: WordTiming[]; engine_used: string }> {
  const res = await synthesizeScenesVoiceOver({
    scenes: [{ scene_number: 1, narration: params.text }],
    voice: params.voice,
  });
  const asset = res.audioAssets[0]!;
  const srcDisk = path.isAbsolute(asset.local_file_path)
    ? asset.local_file_path
    : path.join(params.repoRoot, asset.local_file_path);
  await copyFile(srcDisk, params.destDisk);
  await rm(srcDisk, { force: true }).catch(() => {});
  return {
    duration_sec: asset.duration_sec,
    words: asset.words,
    engine_used: asset.engine_used,
  };
}

export async function synthesizeSceneFromSentenceCache(params: {
  sceneId: string;
  sentences: Array<{ ref: string; spokenText: string }>;
  voice: VoiceId;
  audioDir: string;
  repoRoot: string;
  manifest: SentenceManifest;
  synthesizeSentenceFn?: SynthesizeSentenceFn;
}): Promise<{
  sceneMp3Disk: string;
  duration_sec: number;
  words: WordTiming[];
  engine_used: string;
  reusedRefs: string[];
  synthesizedRefs: string[];
}> {
  const sentencesDir = path.join(params.audioDir, 'sentences');
  await mkdir(sentencesDir, { recursive: true });

  const synthFn = params.synthesizeSentenceFn ?? defaultSynthesizeSentence;
  const reusedRefs: string[] = [];
  const synthesizedRefs: string[] = [];
  const sentFiles: string[] = [];
  const combinedWords: WordTiming[] = [];
  let offsetSec = 0;
  let engineUsed = 'msedge-tts';

  for (const s of params.sentences) {
    const textHash = sha256Hex(`${params.voice}|${s.spokenText}`);
    const sentMp3 = path.join(sentencesDir, `${s.ref}.mp3`);
    const cached = params.manifest[s.ref];

    let entry: SentenceCacheEntry;
    if (cached && cached.text_hash === textHash && existsSync(sentMp3)) {
      entry = cached;
      reusedRefs.push(s.ref);
    } else {
      const res = await synthFn({
        ref: s.ref,
        text: s.spokenText,
        voice: params.voice,
        destDisk: sentMp3,
        repoRoot: params.repoRoot,
      });
      const audioBytes = await readFile(sentMp3);
      entry = {
        ref: s.ref,
        text_hash: textHash,
        audio_sha256: sha256Hex(audioBytes),
        duration_sec: res.duration_sec,
        words: res.words,
        engine_used: res.engine_used,
        voice_id: params.voice,
      };
      params.manifest[s.ref] = entry;
      synthesizedRefs.push(s.ref);
    }

    engineUsed = entry.engine_used;
    sentFiles.push(sentMp3);
    for (const w of entry.words) {
      combinedWords.push({
        ...w,
        start: Number((w.start + offsetSec).toFixed(3)),
        end: Number((w.end + offsetSec).toFixed(3)),
      });
    }
    offsetSec += entry.duration_sec;
  }

  const sceneMp3Disk = path.join(params.audioDir, `${params.sceneId}.mp3`);
  if (sentFiles.length === 1) {
    await copyFile(sentFiles[0]!, sceneMp3Disk);
  } else {
    const listPath = path.join(sentencesDir, `_${params.sceneId}_concat.txt`);
    await writeFile(
      listPath,
      sentFiles.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
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
      listPath,
      '-c:a',
      'libmp3lame',
      '-q:a',
      '4',
      sceneMp3Disk,
    ]);
    await rm(listPath, { force: true }).catch(() => {});
  }

  const probedDur = await probeMp3DurationSec(sceneMp3Disk).catch(() => offsetSec);
  return {
    sceneMp3Disk,
    duration_sec: probedDur > 0 ? probedDur : offsetSec,
    words: combinedWords,
    engine_used: engineUsed,
    reusedRefs,
    synthesizedRefs,
  };
}
