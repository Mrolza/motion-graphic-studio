import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import type { QcIssue } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { TimelineSchema } from '@core/contracts/timeline';
import { getProjectDir, loadProject, saveProject } from '@core/project/store';
import { checkCaptionsQc } from '@core/qc/captions-qc';
import type { KineticCaptionChunk } from '@core/render/kinetic-captions';

const execFileAsync = promisify(execFile);

export interface FinalQcReport {
  projectId: string;
  passed: boolean;
  technical: {
    width: number;
    height: number;
    fps: number;
    videoCodec: string;
    pixFmt: string;
    audioCodec: string;
    audioSampleRate: number;
    videoDurationSec: number;
    audioDurationSec: number;
    avDiffMs: number;
    frameCount: number;
    expectedFrames: number;
  };
  audio: {
    integratedLufs: number;
    truePeakDbfs: number;
    maxVoGapSec: number;
    silenceHits: number;
  };
  visual: {
    blackHits: number;
    freezeHits: number;
  };
  process: {
    totalLlmCalls: number;
    exceedsPrdLlmBudget: boolean;
  };
  issues: QcIssue[];
}

export async function runFinalQcStage(
  projectId: string,
  options?: {
    videoPath?: string;
    voWavPath?: string;
    expectedDurationSec?: number;
    skipAggregatedReports?: boolean;
    repoRoot?: string;
  }
): Promise<FinalQcReport> {
  const repoRoot = options?.repoRoot ?? process.cwd();
  const projectDir = getProjectDir(projectId, repoRoot);
  const project = await loadProject(projectId, repoRoot);
  const videoPath = options?.videoPath ?? path.join(projectDir, 'final.mp4');
  const voWavPath = options?.voWavPath ?? path.join(projectDir, 'audio', 'vo.wav');

  const issues: QcIssue[] = [];

  // 1. Probe streams & frame count
  const { stdout: probeJson } = await execFileAsync(ffprobeInstaller.path, [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    videoPath,
  ]);
  const parsed = JSON.parse(probeJson) as {
    streams: Array<{
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      pix_fmt?: string;
      r_frame_rate?: string;
      sample_rate?: string;
      duration?: string;
      nb_frames?: string;
    }>;
  };
  const vStream = parsed.streams.find((s) => s.codec_type === 'video');
  const aStream = parsed.streams.find((s) => s.codec_type === 'audio');

  const width = vStream?.width ?? 0;
  const height = vStream?.height ?? 0;
  const [fpsNum, fpsDen] = (vStream?.r_frame_rate ?? '30/1').split('/').map(Number);
  const fps = fpsDen ? Math.round((fpsNum! / fpsDen) * 100) / 100 : 30;
  const videoCodec = vStream?.codec_name ?? '';
  const pixFmt = vStream?.pix_fmt ?? '';
  const audioCodec = aStream?.codec_name ?? '';
  const audioSampleRate = Number(aStream?.sample_rate ?? 0);
  const videoDurationSec = Number(vStream?.duration ?? 0);
  const audioDurationSec = Number(aStream?.duration ?? 0);
  const avDiffMs = Math.round(Math.abs(videoDurationSec - audioDurationSec) * 1000);

  const { stdout: frameOut } = await execFileAsync(ffprobeInstaller.path, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-count_frames',
    '-show_entries',
    'stream=nb_read_frames',
    '-of',
    'csv=p=0',
    videoPath,
  ]);
  const frameCount = Number(frameOut.trim()) || 0;

  let expectedFrames = frameCount;
  if (options?.expectedDurationSec !== undefined) {
    expectedFrames = Math.round(options.expectedDurationSec * 30);
  } else {
    try {
      const tl = TimelineSchema.parse(
        JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8'))
      );
      expectedFrames = Math.max(30, Math.round(tl.total_sec * 30));
    } catch {
      expectedFrames = frameCount;
    }
  }

  if (width !== 720 || height !== 1280) {
    issues.push({ severity: 'error', message: `FINAL_RESOLUTION: ${width}x${height} != 720x1280`, ref: 'technical' });
  }
  if (Math.abs(fps - 30) > 0.1 || videoCodec !== 'h264' || pixFmt !== 'yuv420p') {
    issues.push({ severity: 'error', message: `FINAL_VIDEO_FORMAT: ${videoCodec}/${pixFmt} @ ${fps}fps`, ref: 'technical' });
  }
  if (audioCodec !== 'aac' || audioSampleRate !== 48000) {
    issues.push({ severity: 'error', message: `FINAL_AUDIO_FORMAT: ${audioCodec} @ ${audioSampleRate}Hz`, ref: 'technical' });
  }
  if (!options?.skipAggregatedReports && (videoDurationSec < 30 || videoDurationSec > 60)) {
    issues.push({ severity: 'error', message: `FINAL_DURATION: ${videoDurationSec.toFixed(2)}s di luar [30, 60]s`, ref: 'technical' });
  }
  if (avDiffMs > 50) {
    issues.push({ severity: 'error', message: `FINAL_AV_SYNC: selisih audio-video ${avDiffMs}ms (> 50ms)`, ref: 'technical' });
  }
  if (frameCount !== expectedFrames) {
    issues.push({
      severity: 'error',
      message: `FINAL_FRAME_COUNT: jumlah frame ${frameCount} != target ${expectedFrames}`,
      ref: 'technical',
    });
  }

  // 2. Audio: ebur128 & silencedetect on mix + silencedetect on VO stem
  const nulDev = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const ebu = await execFileAsync(ffmpegInstaller.path, [
    '-i',
    videoPath,
    '-af',
    'ebur128=peak=true',
    '-f',
    'null',
    nulDev,
  ]);
  const ebuErr = ebu.stderr ?? '';
  const iMatch = ebuErr.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
  const tpMatch = ebuErr.match(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/);
  const integratedLufs = iMatch ? Number(iMatch[1]) : -99;
  const truePeakDbfs = tpMatch ? Number(tpMatch[1]) : 0;

  if (integratedLufs < -15 || integratedLufs > -13 || truePeakDbfs > -1.5) {
    issues.push({
      severity: 'error',
      message: `FINAL_LOUDNESS: ${integratedLufs} LUFS / ${truePeakDbfs} dBFS di luar target [-15..-13 LUFS, <= -1.5 dBTP]`,
      ref: 'audio',
    });
  }

  const silMix = await execFileAsync(ffmpegInstaller.path, [
    '-i',
    videoPath,
    '-af',
    'silencedetect=noise=-45dB:d=0.4',
    '-f',
    'null',
    nulDev,
  ]);
  const mixSilMatches = (silMix.stderr ?? '').match(/silence_duration:/g) ?? [];
  const silenceHits = mixSilMatches.length;
  if (silenceHits > 0) {
    issues.push({
      severity: 'error',
      message: `FINAL_DEAD_AIR: terdeteksi ${silenceHits} jeda hening >= 0.4s pada audio mix`,
      ref: 'audio',
    });
  }

  let maxVoGapSec = 0;
  try {
    const silVo = await execFileAsync(ffmpegInstaller.path, [
      '-i',
      voWavPath,
      '-af',
      'silencedetect=noise=-45dB:d=0.4',
      '-f',
      'null',
      nulDev,
    ]);
    const voDurs = [...(silVo.stderr ?? '').matchAll(/silence_duration:\s*([\d.]+)/g)].map((m) =>
      Number(m[1])
    );
    for (const d of voDurs) {
      if (d > maxVoGapSec) maxVoGapSec = d;
    }
    if (maxVoGapSec > 0.4) {
      issues.push({
        severity: 'error',
        message: `FINAL_DEAD_AIR: jeda pada stem VO mencapai ${maxVoGapSec.toFixed(2)}s (> 0.4s)`,
        ref: 'audio',
      });
    }
  } catch {
    // Optional if vo.wav not provided in standalone technical test
  }

  // 3. Visual: blackdetect & freezedetect
  const blk = await execFileAsync(ffmpegInstaller.path, [
    '-i',
    videoPath,
    '-vf',
    'blackdetect=d=0.1:pix_th=0.10,freezedetect=n=0.001:d=1.5',
    '-f',
    'null',
    nulDev,
  ]);
  const blkErr = blk.stderr ?? '';
  const blackHits = (blkErr.match(/black_start:/g) ?? []).length;
  const freezeHits = (blkErr.match(/freeze_start:/g) ?? []).length;
  if (blackHits > 0) {
    issues.push({
      severity: 'error',
      message: `FINAL_BLACK_FRAMES: terdeteksi ${blackHits} segmen frame hitam >= 0.1s`,
      ref: 'visual',
    });
  }
  if (freezeHits > 0) {
    issues.push({
      severity: 'warning',
      message: `FINAL_FREEZE_FRAME: terdeteksi ${freezeHits} segmen gambar statis > 1.5s`,
      ref: 'visual',
    });
  }

  // 4. Aggregate facts & captions QC
  if (!options?.skipAggregatedReports) {
    try {
      const sbRep = JSON.parse(await readFile(path.join(projectDir, 'qc', 'storyboard.json'), 'utf-8')) as {
        issues: QcIssue[];
      };
      for (const iss of sbRep.issues) {
        if (iss.severity === 'error') issues.push({ ...iss, ref: `storyboard:${iss.ref ?? ''}` });
      }
    } catch {
      issues.push({ severity: 'error', message: 'FINAL_MISSING_STORYBOARD_QC', ref: 'facts' });
    }
    try {
      const summary = JSON.parse(
        await readFile(path.join(projectDir, 'scenes', 'summary.json'), 'utf-8')
      ) as Array<{ sceneId: string; passed: boolean; errors: string[] }>;
      for (const s of summary) {
        if (!s.passed) {
          issues.push({
            severity: 'error',
            message: `FINAL_SCENE_FAILED: ${s.sceneId} — ${s.errors[0] ?? 'failed'}`,
            ref: s.sceneId,
          });
        }
      }
    } catch {
      issues.push({ severity: 'error', message: 'FINAL_MISSING_SCENE_SUMMARY', ref: 'facts' });
    }
    try {
      const script = JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8')) as Script;
      const timeline = TimelineSchema.parse(
        JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8'))
      );
      const chunks = JSON.parse(
        await readFile(path.join(projectDir, 'captions.json'), 'utf-8')
      ) as KineticCaptionChunk[];
      const capRep = checkCaptionsQc({ chunks, script, timeline });
      for (const iss of capRep.issues) {
        issues.push(iss);
      }
    } catch {
      issues.push({ severity: 'error', message: 'FINAL_MISSING_CAPTIONS', ref: 'captions' });
    }
  }

  const totalLlmCalls = Object.values(project.llm_calls).reduce((a, b) => a + b, 0);
  const exceedsPrdLlmBudget = totalLlmCalls > 15;
  if (exceedsPrdLlmBudget) {
    issues.push({
      severity: 'warning',
      message: `PROCESS_LLM_BUDGET: total panggilan LLM S1–S12 = ${totalLlmCalls} (> 15 batas PRD §5)`,
      ref: 'process',
    });
  }

  const passed = !issues.some((i) => i.severity === 'error');
  const report: FinalQcReport = {
    projectId,
    passed,
    technical: {
      width,
      height,
      fps,
      videoCodec,
      pixFmt,
      audioCodec,
      audioSampleRate,
      videoDurationSec,
      audioDurationSec,
      avDiffMs,
      frameCount,
      expectedFrames,
    },
    audio: {
      integratedLufs,
      truePeakDbfs,
      maxVoGapSec,
      silenceHits,
    },
    visual: {
      blackHits,
      freezeHits,
    },
    process: {
      totalLlmCalls,
      exceedsPrdLlmBudget,
    },
    issues,
  };

  if (!options?.skipAggregatedReports) {
    await writeFile(path.join(projectDir, 'final-qc.json'), JSON.stringify(report, null, 2), 'utf-8');
    const md = `# Final QC — ${projectId}\n\n- **Status:** ${passed ? '**PASS**' : '**FAIL**'}\n- **Video:** ${width}x${height} @ ${fps}fps (${videoCodec}/${pixFmt}), ${frameCount}/${expectedFrames} frames, ${videoDurationSec.toFixed(2)}s\n- **Audio:** ${audioCodec} ${audioSampleRate}Hz, ${integratedLufs} LUFS, peak ${truePeakDbfs} dBFS, A/V diff ${avDiffMs}ms, silence hits=${silenceHits}\n- **Visual:** black=${blackHits}, freeze=${freezeHits}\n- **LLM Calls (S1–S12):** ${totalLlmCalls}${exceedsPrdLlmBudget ? ' (>15!)' : ''}\n\n## Issues (${issues.length})\n${
      issues.length === 0
        ? '- None'
        : issues.map((i) => `- [${i.severity.toUpperCase()}] (${i.ref ?? '-'}) ${i.message}`).join('\n')
    }\n`;
    await writeFile(path.join(projectDir, 'final-qc.md'), md, 'utf-8');

    const updated = await loadProject(projectId, repoRoot);
    updated.stages.S12 = passed ? 'done' : 'failed';
    await saveProject(updated, repoRoot);
  }

  return report;
}
