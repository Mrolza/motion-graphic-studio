import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcIssue } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema } from '@core/contracts/storyboard';
import { TimelineSchema } from '@core/contracts/timeline';
import {
  checkCaptionsQc,
  estimateStoryboardCaptionOverlaps,
  formatOverlapScanMarkdown,
  scanTelemetryOverlaps,
} from '@core/qc/captions-qc';
import { verifyNarrationHudSync } from '@core/qc/narration-hud-conflict';
import { checkHudSpelling } from '@core/qc/spellcheck-id';
import { verifyStoryboardCode } from '@core/qc/storyboard-code';
import { detectTopicDomain } from '@core/kit/domain-registry';
import type { TelemetrySample } from '@core/qc/visual/types';
import type { KineticCaptionChunk } from '@core/render/kinetic-captions';
import { LAYOUT_9X16 } from '@core/render/layout-zones';

export interface TtsSceneRecord {
  scene_id: string;
  engine_used: string;
  voice_id: string;
}

export async function checkTtsVoiceConsistency(
  projectDir: string
): Promise<{ issues: QcIssue[]; ttsScenes: TtsSceneRecord[] }> {
  const issues: QcIssue[] = [];
  let ttsScenes: TtsSceneRecord[] = [];
  try {
    const raw = await readFile(path.join(projectDir, 'audio', 'tts-manifest.json'), 'utf-8');
    const parsed = JSON.parse(raw) as TtsSceneRecord[];
    if (Array.isArray(parsed)) {
      ttsScenes = parsed;
      const engines = new Set(parsed.map((s) => s.engine_used).filter(Boolean));
      const voices = new Set(parsed.map((s) => s.voice_id).filter(Boolean));
      if (engines.size > 1 || voices.size > 1) {
        issues.push({
          severity: 'error',
          message: `AUDIO_VOICE_MISMATCH: mesin/suara TTS tidak seragam antar adegan (engines=[${[...engines].join(',')}], voices=[${[...voices].join(',')}])`,
          ref: 'audio',
        });
      }
    }
  } catch {
    // No manifest (e.g., legacy or synthetic audio-only test)
  }
  return { issues, ttsScenes };
}

export function checkFinalTechnicalFormat(params: {
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  pixFmt: string;
  audioCodec: string;
  audioSampleRate: number;
}): QcIssue[] {
  const { width, height, fps, videoCodec, pixFmt, audioCodec, audioSampleRate } = params;
  const out: QcIssue[] = [];
  if (width !== 720 || height !== 1280) {
    out.push({ severity: 'error', message: `FINAL_RESOLUTION: ${width}x${height} != 720x1280`, ref: 'technical' });
  }
  if (Math.abs(fps - 30) > 0.1 || videoCodec !== 'h264') {
    out.push({ severity: 'error', message: `FINAL_VIDEO_FORMAT: ${videoCodec}/${pixFmt} @ ${fps}fps`, ref: 'technical' });
  }
  if (pixFmt !== 'yuv420p') {
    out.push({
      severity: 'error',
      message: `FINAL_PIXFMT: pixel format "${pixFmt}" bukan yuv420p`,
      ref: 'technical',
    });
  }
  if (audioCodec !== 'aac' || audioSampleRate !== 48000) {
    out.push({ severity: 'error', message: `FINAL_AUDIO_FORMAT: ${audioCodec} @ ${audioSampleRate}Hz`, ref: 'technical' });
  }
  return out;
}

export async function runFinalSyncAndOverlapChecks(
  projectId: string,
  projectDir: string,
  issues: QcIssue[]
): Promise<void> {
  try {
    const script = JSON.parse(await readFile(path.join(projectDir, 'script.json'), 'utf-8')) as Script;
    const timeline = TimelineSchema.parse(
      JSON.parse(await readFile(path.join(projectDir, 'timeline.json'), 'utf-8'))
    );
    const chunks = JSON.parse(
      await readFile(path.join(projectDir, 'captions.json'), 'utf-8')
    ) as KineticCaptionChunk[];
    const telemetrySamples = JSON.parse(
      await readFile(path.join(projectDir, 'telemetry-samples.json'), 'utf-8').catch(() => '[]')
    ) as TelemetrySample[];

    issues.push(...checkCaptionsQc({ chunks, script, timeline, telemetrySamples }).issues);

    const storyboardRaw = await readFile(path.join(projectDir, 'storyboard.json'), 'utf-8').catch(() => '');
    const ledgerRaw = await readFile(path.join(projectDir, 'fact-ledger.json'), 'utf-8').catch(() => '');
    if (storyboardRaw && ledgerRaw) {
      const storyboard = StoryboardSchema.parse(JSON.parse(storyboardRaw));
      const ledger = JSON.parse(ledgerRaw) as FactLedger;
      const projRaw = await readFile(path.join(projectDir, 'project.json'), 'utf-8').catch(() => '');
      const projTopic = projRaw ? (JSON.parse(projRaw) as { topic?: string }).topic ?? '' : '';
      const domain = projTopic ? detectTopicDomain(projTopic) : undefined;

      const freshSbCode = verifyStoryboardCode(storyboard, script, timeline, ledger, { domain });
      for (const iss of freshSbCode.issues) {
        if (!issues.some((e) => e.message === iss.message && e.ref === `storyboard:${iss.ref ?? ''}`)) {
          issues.push({ ...iss, ref: `storyboard:${iss.ref ?? ''}` });
        }
      }
      issues.push(...verifyNarrationHudSync({ script, storyboard, timeline, captions: chunks }).issues);
      issues.push(...checkHudSpelling(storyboard, { script, ledger }));

      const scan =
        telemetrySamples.length > 0
          ? scanTelemetryOverlaps(telemetrySamples, 5)
          : estimateStoryboardCaptionOverlaps({
              storyboard,
              timeline,
              chunks,
              stepFrames: 5,
              calloutTopY: LAYOUT_9X16.zones.callout.top,
              captionTopY: LAYOUT_9X16.zones.caption.top,
            });
      await writeFile(
        path.join(projectDir, 'overlap-scan.md'),
        formatOverlapScanMarkdown(projectId, scan),
        'utf-8'
      );
      if (
        scan.overlaps.length > 0 &&
        !issues.some((i) => i.message.startsWith('CAPTION_HUD_OVERLAP'))
      ) {
        const first = scan.overlaps[0]!;
        issues.push({
          severity: 'error',
          message: `CAPTION_HUD_OVERLAP: ${scan.overlaps.length} overlap terdeteksi (pertama di f${first.frame} / ${first.sec.toFixed(2)}s dengan "${first.hudId}")`,
          ref: `f${first.frame} (${first.sec.toFixed(2)}s)`,
        });
      }
    }
  } catch {
    issues.push({ severity: 'error', message: 'FINAL_MISSING_CAPTIONS', ref: 'captions' });
  }
}
