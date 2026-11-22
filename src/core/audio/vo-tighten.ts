import { execFile } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { Timeline } from '@core/contracts/timeline';
type TimelineWord = Timeline['words'][number];

const execFileAsync = promisify(execFile);

export interface GapRecord {
  scene_id: string;
  between: string;
  before_sec: number;
  after_sec: number;
  kind: 'sentence' | 'comma' | 'scene';
}

export interface TightenVoResult {
  timeline: Timeline;
  gaps: GapRecord[];
  maxGapBeforeSec: number;
  maxGapAfterSec: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Tightens VO pauses > 0.4s inside existing scene MP3s without re-running TTS.
 * Keeps 40ms padding around word boundaries so no consonant/vowel tail is clipped.
 */
export async function tightenProjectVoice(params: {
  projectId: string;
  projectDir: string;
  timeline: Timeline;
  repoRoot: string;
}): Promise<TightenVoResult> {
  const { projectId, projectDir, timeline, repoRoot } = params;
  const ffmpegBin = ffmpegInstaller.path;
  const audioDir = path.join(projectDir, 'audio');
  await mkdir(audioDir, { recursive: true });

  const gaps: GapRecord[] = [];
  let maxGapBeforeSec = 0;
  let maxGapAfterSec = 0;
  const padSec = 0.015;
  const sceneGapSec = 0.12;

  const newScenes: Timeline['scenes'] = [];
  const newWords: TimelineWord[] = [];
  let cursorSec = 0;

  for (let sIdx = 0; sIdx < timeline.scenes.length; sIdx++) {
    const sc = timeline.scenes[sIdx]!;
    const srcAudio = path.join(repoRoot, sc.audio_path);
    const scWords = timeline.words
      .filter((w) => w.scene_id === sc.scene_id)
      .map((w) => ({
        ...w,
        start: Math.max(0, w.start - sc.start),
        end: Math.max(0, w.end - sc.start),
      }));

    const origDur = Math.max(0.2, sc.end - sc.start);
    const keepRanges: Array<{ start: number; end: number }> = [];
    const leadTrim = scWords.length > 0 ? Math.max(0, scWords[0]!.start - 0.03) : 0;
    const tailEnd = scWords.length > 0 ? Math.min(origDur, scWords[scWords.length - 1]!.end + 0.04) : origDur;
    let segStart = leadTrim;
    let removedTotal = leadTrim + Math.max(0, origDur - tailEnd);
    const shifts: Array<{ afterOrigSec: number; removedSec: number }> = [];
    if (leadTrim > 0.01) {
      shifts.push({ afterOrigSec: 0, removedSec: leadTrim });
    }

    for (let i = 0; i < scWords.length - 1; i++) {
      const cur = scWords[i]!;
      const nxt = scWords[i + 1]!;
      const gap = nxt.start - cur.end;
      if (gap > maxGapBeforeSec) maxGapBeforeSec = round3(gap);

      if (gap > 0.22) {
        const isSentenceEnd = /[.!?]$/.test(cur.text.trim());
        const targetGap = isSentenceEnd ? 0.15 : 0.13;
        const cutStart = cur.end + padSec;
        const cutEnd = nxt.start - padSec;
        const available = cutEnd - cutStart;
        const targetInner = Math.max(0, targetGap - 2 * padSec);
        if (available > targetInner + 0.02) {
          const trimDur = available - targetInner;
          keepRanges.push({ start: round3(segStart), end: round3(cutStart + targetInner / 2) });
          segStart = round3(cutEnd - targetInner / 2);
          removedTotal += trimDur;
          shifts.push({ afterOrigSec: nxt.start, removedSec: trimDur });
          const afterGap = round3(gap - trimDur);
          if (afterGap > maxGapAfterSec) maxGapAfterSec = afterGap;
          gaps.push({
            scene_id: sc.scene_id,
            between: `${cur.text} -> ${nxt.text}`,
            before_sec: round3(gap),
            after_sec: afterGap,
            kind: isSentenceEnd ? 'sentence' : 'comma',
          });
        } else {
          if (round3(gap) > maxGapAfterSec) maxGapAfterSec = round3(gap);
        }
      } else if (gap > maxGapAfterSec) {
        maxGapAfterSec = round3(gap);
      }
    }
    keepRanges.push({ start: round3(segStart), end: round3(tailEnd) });

    if (removedTotal > 0.01) {
      const tmpOut = path.join(audioDir, `${sc.scene_id}.tight.mp3`);
      const filterParts = keepRanges.map(
        (r, idx) => `[0:a]atrim=start=${r.start}:end=${r.end},asetpts=PTS-STARTPTS[a${idx}]`
      );
      const concatIn = keepRanges.map((_, idx) => `[a${idx}]`).join('');
      const filterComplex = `${filterParts.join(';')};${concatIn}concat=n=${keepRanges.length}:v=0:a=1[outa]`;
      await execFileAsync(ffmpegBin, [
        '-y',
        '-v',
        'error',
        '-i',
        srcAudio,
        '-filter_complex',
        filterComplex,
        '-map',
        '[outa]',
        '-c:a',
        'libmp3lame',
        '-q:a',
        '3',
        tmpOut,
      ]);
      await rename(tmpOut, srcAudio);
    }

    const newDur = round3(Math.max(0.2, origDur - removedTotal));
    newScenes.push({
      scene_id: sc.scene_id,
      audio_path: sc.audio_path,
      start: round3(cursorSec),
      end: round3(cursorSec + newDur),
    });

    for (const w of scWords) {
      let accShift = 0;
      for (const sh of shifts) {
        if (w.start >= sh.afterOrigSec - 0.01) accShift += sh.removedSec;
      }
      newWords.push({
        scene_id: w.scene_id,
        text: w.text,
        start: round3(cursorSec + Math.max(0, w.start - accShift)),
        end: round3(cursorSec + Math.max(0, w.end - accShift)),
      });
    }

    cursorSec += newDur;
    if (sIdx < timeline.scenes.length - 1) {
      gaps.push({
        scene_id: `${sc.scene_id}->${timeline.scenes[sIdx + 1]!.scene_id}`,
        between: '(jeda antaradegan)',
        before_sec: sceneGapSec,
        after_sec: sceneGapSec,
        kind: 'scene',
      });
      if (sceneGapSec > maxGapAfterSec) maxGapAfterSec = sceneGapSec;
      cursorSec += sceneGapSec;
    }
  }

  // Rebuild vo-full.mp3 with tightened scene audio + 0.22s scene gaps
  const voFullPath = path.join(audioDir, 'vo-full.mp3');
  const silencePath = path.join(audioDir, '_gap.mp3');
  await execFileAsync(ffmpegBin, [
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
  for (let i = 0; i < newScenes.length; i++) {
    concatInputs.push(`file '${path.join(repoRoot, newScenes[i]!.audio_path).replace(/'/g, "'\\''")}'`);
    if (i < newScenes.length - 1) {
      concatInputs.push(`file '${silencePath.replace(/'/g, "'\\''")}'`);
    }
  }
  const concatListPath = path.join(audioDir, '_concat.txt');
  await writeFile(concatListPath, concatInputs.join('\n'), 'utf-8');
  await execFileAsync(ffmpegBin, [
    '-y',
    '-v',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatListPath,
    '-c:a',
    'libmp3lame',
    '-q:a',
    '3',
    voFullPath,
  ]);

  const updatedTimeline: Timeline = {
    ...timeline,
    total_sec: round3(cursorSec),
    scenes: newScenes,
    words: newWords,
  };

  await writeFile(path.join(projectDir, 'timeline.json'), JSON.stringify(updatedTimeline, null, 2), 'utf-8');
  const rows = gaps.map(
    (g) => `| ${g.scene_id} | ${g.between} | ${g.kind} | ${g.before_sec.toFixed(3)}s | ${g.after_sec.toFixed(3)}s |`
  );
  await writeFile(
    path.join(projectDir, 'timeline-gaps.md'),
    `# Jeda VO (${projectId})\n\n- Jeda maks sebelum: ${maxGapBeforeSec.toFixed(3)}s\n- Jeda maks sesudah: ${maxGapAfterSec.toFixed(3)}s\n\n| Adegan | Antar Kata | Jenis | Sebelum | Sesudah |\n|---|---|---|---:|---:|\n${rows.join(
      '\n'
    )}\n`,
    'utf-8'
  );

  return { timeline: updatedTimeline, gaps, maxGapBeforeSec, maxGapAfterSec };
}
