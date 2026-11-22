import type { QcIssue } from '@core/contracts/qc-report';
import type { TelemetrySample } from './types';

export interface ArrowTelemetrySummary {
  arrowId: string;
  bindPart: string;
  avgDirY: number;
  partDeltaY: number;
  matched: boolean;
}

export function analyzeArrowDirectionFromTelemetry(samples: TelemetrySample[]): {
  issues: QcIssue[];
  summaries: ArrowTelemetrySummary[];
} {
  const issues: QcIssue[] = [];
  const summaries: ArrowTelemetrySummary[] = [];

  const pistonSamples = samples
    .map((s) => {
      const ent = s.entities.find((e) => typeof e.partStates?.piston_y === 'number');
      return ent ? { frame: s.frame, sec: s.sec, y: Number(ent.partStates!.piston_y) } : null;
    })
    .filter((x): x is { frame: number; sec: number; y: number } => Boolean(x));

  if (pistonSamples.length < 2) return { issues, summaries };
  const totalDeltaY = pistonSamples[pistonSamples.length - 1]!.y - pistonSamples[0]!.y;

  const arrowHits = samples.flatMap((s) =>
    s.entities
      .filter((e) => typeof e.partStates?.arrow_dir_y === 'number')
      .map((e) => ({
        frame: s.frame,
        sec: s.sec,
        dirY: Number(e.partStates!.arrow_dir_y),
        id: e.id,
        part: String(e.partStates?.bind_to_part ?? 'piston'),
      }))
  );

  if (arrowHits.length === 0) return { issues, summaries };
  const byId = new Map<string, typeof arrowHits>();
  for (const h of arrowHits) {
    byId.set(h.id, [...(byId.get(h.id) ?? []), h]);
  }

  for (const [id, hits] of byId.entries()) {
    const avgDirY = hits.reduce((acc, a) => acc + a.dirY, 0) / hits.length;
    const mismatch =
      Math.abs(totalDeltaY) > 0.02 &&
      ((totalDeltaY < -0.02 && avgDirY > 0.2) || (totalDeltaY > 0.02 && avgDirY < -0.2));
    summaries.push({
      arrowId: id,
      bindPart: hits[0]!.part,
      avgDirY: Number(avgDirY.toFixed(3)),
      partDeltaY: Number(totalDeltaY.toFixed(3)),
      matched: !mismatch,
    });
    if (mismatch) {
      issues.push({
        severity: 'error',
        message: `VIS_ARROW_DIRECTION_MISMATCH: panah "${id}" (dir_y=${avgDirY.toFixed(2)}) berlawanan arah gerak "${hits[0]!.part}" (delta_y=${totalDeltaY.toFixed(3)})`,
        ref: `f${hits[0]!.frame} (${hits[0]!.sec.toFixed(2)}s)`,
      });
    }
  }

  return { issues, summaries };
}
