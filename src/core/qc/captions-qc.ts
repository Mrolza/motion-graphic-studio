import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import type { Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import type { TelemetrySample } from '@core/qc/visual/types';
import { alignDisplayWordsToTimeline, type KineticCaptionChunk } from '@core/render/kinetic-captions';
import { LAYOUT_9X16 } from '@core/render/layout-zones';

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return x2 > x1 + 2 && y2 > y1 + 2;
}

/**
 * Validates kinetic captions for text accuracy, word timing sync (<= 50ms),
 * chunk length (2-5 words, <= 2 lines), HUD overlap, and 9:16 platform safe area.
 */
export function checkCaptionsQc(params: {
  chunks: readonly KineticCaptionChunk[];
  script: Script;
  timeline: Timeline;
  telemetrySamples?: readonly TelemetrySample[];
}): QcReport {
  const { chunks, script, timeline, telemetrySamples = [] } = params;
  const issues: QcIssue[] = [];

  const expectedNarration = normalizeText(
    script.scenes.flatMap((s) => s.sentences.map((st) => st.text)).join(' ')
  );
  const actualCaptionText = normalizeText(chunks.flatMap((c) => c.words.map((w) => w.text)).join(' '));
  if (actualCaptionText !== expectedNarration) {
    issues.push({
      severity: 'error',
      message: `CAPTION_TEXT_MISMATCH: teks takarir tidak sama persis dengan narasi naskah`,
      ref: 'captions',
    });
  }

  const expectedAligned = alignDisplayWordsToTimeline(script, timeline);
  let wordIdx = 0;
  for (const c of chunks) {
    if (c.lines.length > 2 || c.words.length > 5) {
      issues.push({
        severity: 'error',
        message: `CAPTION_TOO_LONG: "${c.id}" memiliki ${c.words.length} kata / ${c.lines.length} baris (maks 5 kata, 2 baris)`,
        ref: c.id,
      });
    }
    for (const w of c.words) {
      const exp = expectedAligned[wordIdx];
      wordIdx++;
      if (!exp) continue;
      const diffMs = Math.max(
        Math.abs(w.start_sec - exp.start_sec),
        Math.abs(w.end_sec - exp.end_sec)
      ) * 1000;
      if (diffMs > 50) {
        issues.push({
          severity: 'error',
          message: `CAPTION_DESYNC: kata "${w.text}" meleset ${Math.round(diffMs)}ms (> 50ms)`,
          ref: c.id,
        });
      }
    }
  }

  const seenOverlap = new Set<string>();
  const seenUnsafe = new Set<string>();
  for (const sample of telemetrySamples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;
    const capHuds = sample.hud.filter((h) => h.zone === 'caption' || h.id === '__kit_captions');
    const otherHuds = sample.hud.filter((h) => h.zone !== 'caption' && h.id !== '__kit_captions');

    for (const cap of capHuds) {
      if (
        cap.bbox.y + cap.bbox.height > LAYOUT_9X16.platformBottomUnsafeY ||
        cap.bbox.x + cap.bbox.width > LAYOUT_9X16.platformRightUnsafeX
      ) {
        if (!seenUnsafe.has(cap.id)) {
          seenUnsafe.add(cap.id);
          issues.push({
            severity: 'error',
            message: `CAPTION_UNSAFE_AREA: takarir [${cap.bbox.x},${cap.bbox.y},${cap.bbox.width}x${cap.bbox.height}] masuk area UI Shorts/Reels (bawah >= ${LAYOUT_9X16.platformBottomUnsafeY} atau kanan >= ${LAYOUT_9X16.platformRightUnsafeX})`,
            ref,
          });
        }
      }
      for (const other of otherHuds) {
        if (boxesOverlap(cap.bbox, other.bbox)) {
          const key = `${cap.id}:${other.id}`;
          if (!seenOverlap.has(key)) {
            seenOverlap.add(key);
            issues.push({
              severity: 'error',
              message: `CAPTION_HUD_OVERLAP: takarir bertumpuk dengan HUD "${other.id}"`,
              ref,
            });
          }
        }
      }
    }
  }

  return { layer: 'L5', issues };
}

export interface OverlapHit {
  frame: number;
  sec: number;
  captionId: string;
  hudId: string;
  captionBbox: { x: number; y: number; width: number; height: number };
  hudBbox: { x: number; y: number; width: number; height: number };
}

export interface OverlapScanResult {
  mode: 'telemetry' | 'estimated';
  totalFramesScanned: number;
  stepFrames: number;
  overlaps: OverlapHit[];
}

export function scanTelemetryOverlaps(
  telemetrySamples: readonly TelemetrySample[],
  stepFrames = 5
): OverlapScanResult {
  const sorted = [...telemetrySamples].sort((a, b) => a.frame - b.frame);
  const sampled = sorted.filter((_, idx) => idx === 0 || sorted[idx]!.frame % stepFrames === 0);
  const overlaps: OverlapHit[] = [];

  for (const sample of sampled) {
    const capHuds = sample.hud.filter((h) => h.zone === 'caption' || h.id === '__kit_captions');
    const otherHuds = sample.hud.filter((h) => h.zone !== 'caption' && h.id !== '__kit_captions');
    for (const cap of capHuds) {
      for (const other of otherHuds) {
        if (boxesOverlap(cap.bbox, other.bbox)) {
          overlaps.push({
            frame: sample.frame,
            sec: sample.sec,
            captionId: cap.id,
            hudId: other.id,
            captionBbox: cap.bbox,
            hudBbox: other.bbox,
          });
        }
      }
    }
  }

  return {
    mode: 'telemetry',
    totalFramesScanned: sampled.length,
    stepFrames,
    overlaps,
  };
}

/**
 * Deterministic layout-zone fallback scanner (every <= 5 frames) when DOM telemetry is unavailable
 * (e.g. regression-checking legacy P4 artifacts using legacy callout top=790 vs caption top=942).
 */
export function estimateStoryboardCaptionOverlaps(params: {
  storyboard: Storyboard;
  timeline: Timeline;
  chunks: readonly KineticCaptionChunk[];
  fps?: number;
  stepFrames?: number;
  calloutTopY?: number;
  captionTopY?: number;
}): OverlapScanResult {
  const {
    storyboard,
    timeline,
    chunks,
    fps = 30,
    stepFrames = 5,
    calloutTopY = 790,
    captionTopY = 942,
  } = params;
  const totalFrames = Math.max(1, Math.round(timeline.total_sec * fps));
  const tlMap = new Map(timeline.scenes.map((s) => [s.scene_id, s]));
  const overlaps: OverlapHit[] = [];
  let scanned = 0;

  for (let frame = 0; frame < totalFrames; frame += stepFrames) {
    scanned++;
    const sec = frame / fps;
    const activeChunk = chunks.find((c) => sec >= c.start_sec && sec <= c.end_sec + 0.04);
    if (!activeChunk) continue;

    const tlScene = tlMap.get(
      timeline.scenes.find((s) => sec >= s.start && sec <= s.end)?.scene_id ?? ''
    );
    if (!tlScene) continue;
    const sbScene = storyboard.scenes.find((s) => s.id === tlScene.scene_id);
    if (!sbScene) continue;

    const capLines = Math.max(1, activeChunk.lines.length);
    const capH = capLines * 36 + 16;
    const capBbox = { x: 82, y: captionTopY, width: 556, height: capH };

    let yCursor = calloutTopY;
    for (let idx = 0; idx < sbScene.hud.length; idx++) {
      const h = sbScene.hud[idx]!;
      if (h.component === 'KineticTitle') continue;
      const zone = String(h.props?.zone ?? 'callout');
      if (zone !== 'callout') continue;

      let itemH = 76;
      if (h.component === 'Callout') {
        const label = String(h.props?.label ?? h.props?.text ?? '');
        const detail = String(h.props?.detail ?? '');
        const labelLines = Math.max(1, Math.ceil(label.length / 28));
        const detailLines = detail ? Math.max(1, Math.ceil(detail.length / 28)) : 0;
        itemH = 20 + labelLines * 32 + (detailLines > 0 ? 4 + detailLines * 32 : 0);
      }
      const hudBbox = { x: 48, y: yCursor, width: 560, height: itemH };
      if (boxesOverlap(capBbox, hudBbox)) {
        overlaps.push({
          frame,
          sec,
          captionId: '__kit_captions',
          hudId: h.hud_id ?? `${sbScene.id}_H${idx + 1}`,
          captionBbox: capBbox,
          hudBbox,
        });
      }
      yCursor += itemH + 12;
    }
  }

  return {
    mode: 'estimated',
    totalFramesScanned: scanned,
    stepFrames,
    overlaps,
  };
}

export function formatOverlapScanMarkdown(projectId: string, scan: OverlapScanResult): string {
  const lines = [
    `# Overlap Scan — ${projectId}`,
    '',
    `- Mode: \`${scan.mode}\``,
    `- Step: setiap \`${scan.stepFrames}\` frame`,
    `- Total frame dipindai: **${scan.totalFramesScanned}**`,
    `- Jumlah overlap caption–HUD: **${scan.overlaps.length}**`,
    '',
  ];
  if (scan.overlaps.length === 0) {
    lines.push('Tidak ada tumpang-tindih antara caption dan HUD di seluruh durasi video.');
  } else {
    lines.push('| Frame | Detik | Caption | HUD | Caption BBox | HUD BBox |');
    lines.push('|---:|---:|---|---|---|---|');
    for (const o of scan.overlaps.slice(0, 50)) {
      lines.push(
        `| ${o.frame} | ${o.sec.toFixed(2)}s | \`${o.captionId}\` | \`${o.hudId}\` | [${o.captionBbox.x},${o.captionBbox.y},${o.captionBbox.width}x${o.captionBbox.height}] | [${o.hudBbox.x},${o.hudBbox.y},${o.hudBbox.width}x${o.hudBbox.height}] |`
      );
    }
  }
  return lines.join('\n') + '\n';
}
