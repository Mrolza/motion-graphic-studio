import type { QcIssue } from '@core/contracts/qc-report';
import type { TelemetrySample } from './types';

export interface ArrowTelemetrySummary {
  arrowId: string;
  bindPart: string;
  bound: boolean;
  matchedFrames: number;
  activeFrames: number;
  matchRatio: number;
  matched: boolean;
  avgDirY?: number;
  partDeltaY?: number;
}

const VELOCITY_THRESHOLD = 0.04;
const MIN_MATCH_RATIO = 0.95;

export function analyzeArrowDirectionFromTelemetry(samples: TelemetrySample[]): {
  issues: QcIssue[];
  summaries: ArrowTelemetrySummary[];
} {
  const issues: QcIssue[] = [];
  const summaries: ArrowTelemetrySummary[] = [];
  if (samples.length < 2) return { issues, summaries };

  const ordered = [...samples].sort((a, b) => a.frame - b.frame);

  // Extract reciprocating part positions per frame (e.g., piston_y)
  const pistonByFrame = new Map<number, { sec: number; y: number }>();
  for (const s of ordered) {
    const ent = s.entities.find((e) => typeof e.partStates?.piston_y === 'number');
    if (ent) {
      pistonByFrame.set(s.frame, { sec: s.sec, y: Number(ent.partStates!.piston_y) });
    }
  }
  const pistonValues = [...pistonByFrame.values()].map((p) => p.y);
  const hasReciprocatingMotion =
    pistonValues.length >= 2 &&
    Math.max(...pistonValues) - Math.min(...pistonValues) > 0.02;

  // Collect all arrows per frame
  const arrowsById = new Map<
    string,
    Array<{ frame: number; sec: number; dirY: number; bindPart: string; bound: boolean }>
  >();

  for (const s of ordered) {
    for (const e of s.entities) {
      if (typeof e.partStates?.arrow_dir_y !== 'number') continue;
      const bindPart = String(e.partStates?.bind_to_part ?? 'unbound');
      const bound = e.partStates?.arrow_bound !== false && bindPart !== 'unbound';
      const list = arrowsById.get(e.id) ?? [];
      list.push({
        frame: s.frame,
        sec: s.sec,
        dirY: Number(e.partStates.arrow_dir_y),
        bindPart,
        bound,
      });
      arrowsById.set(e.id, list);
    }
  }

  for (const [id, hits] of arrowsById.entries()) {
    const isBound = hits.every((h) => h.bound);
    const bindPart = hits[0]!.bindPart;

    if (!isBound) {
      summaries.push({
        arrowId: id,
        bindPart,
        bound: false,
        matchedFrames: 0,
        activeFrames: hits.length,
        matchRatio: 0,
        matched: !hasReciprocatingMotion,
      });
      if (hasReciprocatingMotion) {
        issues.push({
          severity: 'error',
          message: `VIS_ARROW_UNBOUND: panah "${id}" tidak terikat gerak tetapi tampil bersama bagian bergerak bolak-balik`,
          ref: `f${hits[0]!.frame} (${hits[0]!.sec.toFixed(2)}s)`,
        });
      }
      continue;
    }

    if (pistonByFrame.size < 2) {
      summaries.push({
        arrowId: id,
        bindPart,
        bound: true,
        matchedFrames: hits.length,
        activeFrames: hits.length,
        matchRatio: 1,
        matched: true,
      });
      continue;
    }

    let activeFrames = 0;
    let matchedFrames = 0;
    let firstMismatchRef = `f${hits[0]!.frame} (${hits[0]!.sec.toFixed(2)}s)`;
    let recordedMismatch = false;

    for (let i = 1; i < hits.length; i++) {
      const prevHit = hits[i - 1]!;
      const curHit = hits[i]!;
      const prevP = pistonByFrame.get(prevHit.frame);
      const curP = pistonByFrame.get(curHit.frame);
      if (!prevP || !curP) continue;
      const dt = curP.sec - prevP.sec;
      if (dt <= 0) continue;
      const v = (curP.y - prevP.y) / dt;
      if (Math.abs(v) <= VELOCITY_THRESHOLD) continue;

      activeFrames++;
      const expectedSign = Math.sign(v);
      const dirSign = Math.abs(curHit.dirY) > 0.05 ? Math.sign(curHit.dirY) : 0;
      if (dirSign === expectedSign) {
        matchedFrames++;
      } else if (!recordedMismatch) {
        recordedMismatch = true;
        firstMismatchRef = `f${curHit.frame} (${curHit.sec.toFixed(2)}s)`;
      }
    }

    const matchRatio = activeFrames > 0 ? matchedFrames / activeFrames : 1;
    const matched = activeFrames === 0 || matchRatio >= MIN_MATCH_RATIO;
    summaries.push({
      arrowId: id,
      bindPart,
      bound: true,
      matchedFrames,
      activeFrames,
      matchRatio: Number(matchRatio.toFixed(3)),
      matched,
    });

    if (!matched) {
      issues.push({
        severity: 'error',
        message: `VIS_ARROW_DIRECTION_MISMATCH: panah "${id}" hanya cocok arah ${matchedFrames}/${activeFrames} frame (${(matchRatio * 100).toFixed(1)}% < 95%) terhadap "${bindPart}"`,
        ref: firstMismatchRef,
      });
    }
  }

  return { issues, summaries };
}
