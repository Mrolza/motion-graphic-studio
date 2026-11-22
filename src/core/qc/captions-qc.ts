import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import type { TelemetrySample } from '@core/qc/visual/types';
import { alignDisplayWordsToTimeline, type KineticCaptionChunk } from '@core/render/kinetic-captions';
import { LAYOUT_9X16 } from '@core/render/layout-zones';
import type { Timeline } from '@core/contracts/timeline';

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
