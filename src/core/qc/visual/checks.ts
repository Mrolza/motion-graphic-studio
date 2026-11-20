import type { QcIssue } from '@core/contracts/qc-report';
import type { ScreenBox, TelemetrySample, VisualCheckSpec } from './types';
export {
  checkBlankFrames,
  checkOnscreenTruthFromTelemetry,
  checkSyncFromTelemetry,
} from './media-checks';

function intersectionArea(a: ScreenBox, b: ScreenBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

/**
 * Checks mechanical invariants and HUD-to-driver bindings across sampled telemetry frames.
 */
export function checkMechanicsFromTelemetry(
  samples: TelemetrySample[],
  spec: VisualCheckSpec
): QcIssue[] {
  const issues: QcIssue[] = [];
  if (samples.length === 0) {
    issues.push({ severity: 'error', message: 'MECHANICS_NO_TELEMETRY: tidak ada sampel telemetri', ref: spec.compositionId });
    return issues;
  }

  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;

    for (const inv of spec.invariants) {
      if (inv.kind === 'driver_state') {
        const driverEntry = inv.driverName
          ? sample.drivers[inv.driverName]
          : Object.values(sample.drivers)[0];
        if (!driverEntry) continue;
        const eps = inv.epsilon ?? 0.5;
        const [minV, maxV] = inv.whenDriverBetween;
        if (driverEntry.value > minV + eps && driverEntry.value < maxV - eps) {
          const ent = sample.entities.find((e) => e.id === inv.entity);
          const actual = ent?.partStates?.[inv.stateKey];
          if (actual !== inv.expectedValue) {
            issues.push({
              severity: 'error',
              message: `MECHANICS_INVARIANT: ${inv.entity}.${inv.stateKey}=${String(actual)} (harus ${String(inv.expectedValue)} saat driver=${driverEntry.value})`,
              ref,
            });
          }
        }
      } else if (inv.kind === 'hud_matches_driver') {
        const driverEntry = sample.drivers[inv.driverName];
        const hudItem = sample.hud.find((h) => h.id === inv.hudId);
        if (!driverEntry || !hudItem || hudItem.numericValue === undefined) continue;
        const tol = inv.tolerance ?? 1.5;
        if (Math.abs(hudItem.numericValue - driverEntry.value) > tol) {
          issues.push({
            severity: 'error',
            message: `MECHANICS_HUD_MISMATCH: HUD "${inv.hudId}"=${hudItem.numericValue} != driver "${inv.driverName}"=${driverEntry.value}`,
            ref,
          });
        }
      } else if (inv.kind === 'wheel_angle_matches_distance') {
        const ent = sample.entities.find((e) => e.id === inv.entity);
        const dist = Number(ent?.partStates?.distance ?? NaN);
        const angleDeg = Number(ent?.partStates?.wheel_angle_deg ?? NaN);
        if (!Number.isFinite(dist) || !Number.isFinite(angleDeg)) continue;
        const expectedDeg = ((dist / inv.radius) * 180) / Math.PI;
        if (Math.abs(angleDeg - expectedDeg) > (inv.toleranceDeg ?? 1.5)) {
          issues.push({
            severity: 'error',
            message: `MECHANICS_KINEMATICS: wheel_angle_deg=${angleDeg} != expected=${expectedDeg.toFixed(2)}`,
            ref,
          });
        }
      }
    }

    // Check phase-bound HUD items (when.driver_between)
    const firstDriver = Object.values(sample.drivers)[0];
    if (firstDriver && spec.expectedHud) {
      for (const exp of spec.expectedHud) {
        if (!exp.when?.driver_between) continue;
        const [a, b] = exp.when.driver_between;
        const shown = sample.hud.some((h) => (h.hud_id ?? h.id) === exp.hud_id);
        if (shown && (firstDriver.value < a - 0.5 || firstDriver.value > b + 0.5)) {
          issues.push({
            severity: 'error',
            message: `MECHANICS_HUD_OUT_OF_PHASE: HUD "${exp.hud_id}" tampil pada driver=${firstDriver.value} di luar rentang [${a},${b}]`,
            ref,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * Checks that all declared focus entities stay inside 9:16 safe bounds on every sample frame.
 */
export function checkFramingFromTelemetry(
  samples: TelemetrySample[],
  spec: VisualCheckSpec
): QcIssue[] {
  const issues: QcIssue[] = [];
  const safe = spec.safeBounds ?? { minX: 0, maxX: 720, minY: 60, maxY: 1220 };

  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;
    for (const focusId of spec.focusEntities) {
      const ent = sample.entities.find((e) => e.id === focusId);
      if (!ent || !ent.bbox) {
        issues.push({
          severity: 'error',
          message: `FRAMING_MISSING_ENTITY: entitas fokus "${focusId}" tidak memiliki bbox telemetri`,
          ref,
        });
        continue;
      }
      const b = ent.bbox;
      if (
        b.width <= 0 ||
        b.height <= 0 ||
        b.x < safe.minX ||
        b.x + b.width > safe.maxX ||
        b.y < safe.minY ||
        b.y + b.height > safe.maxY
      ) {
        issues.push({
          severity: 'error',
          message: `FRAMING_OUT_OF_BOUNDS: "${focusId}" bbox=[${b.x},${b.y},${b.width}x${b.height}] keluar area aman [${safe.minX}..${safe.maxX}, ${safe.minY}..${safe.maxY}]`,
          ref,
        });
      } else {
        const freeZoneArea = 720 * 560;
        const focusArea = b.width * b.height;
        const minFill = spec.minSubjectFillRatio ?? 0.2;
        if (focusArea / freeZoneArea < minFill) {
          issues.push({
            severity: spec.requireFillError ? 'error' : 'warning',
            message: `FRAMING_TOO_SMALL: "${focusId}" hanya mengisi ${Math.round((focusArea / freeZoneArea) * 100)}% zona bebas (< ${Math.round(minFill * 100)}%)`,
            ref,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * Checks that no two HUD elements overlap and HUD does not excessively cover focus entities.
 */
export function checkHudOverlapFromTelemetry(
  samples: TelemetrySample[],
  spec: VisualCheckSpec
): QcIssue[] {
  const issues: QcIssue[] = [];
  const maxCover = spec.maxHudOverlapRatio ?? 0.35;
  const maxPanels = spec.maxActiveHudPanels ?? 2;

  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;
    const huds = sample.hud;

    const nonTitleHuds = huds.filter((h) => h.zone !== 'title');
    if (nonTitleHuds.length > maxPanels) {
      issues.push({
        severity: 'error',
        message: `HUD_BUDGET_EXCEEDED: ${nonTitleHuds.length} panel HUD aktif bersamaan di luar zona judul (maks ${maxPanels})`,
        ref,
      });
    }

    for (let i = 0; i < huds.length; i++) {
      for (let j = i + 1; j < huds.length; j++) {
        const a = huds[i]!;
        const b = huds[j]!;
        const area = intersectionArea(a.bbox, b.bbox);
        if (area > 4) {
          issues.push({
            severity: 'error',
            message: `HUD_OVERLAP: "${a.id}" bertumpuk dengan "${b.id}" (area=${Math.round(area)}px²)`,
            ref,
          });
        }
      }
    }

    for (const focusId of spec.focusEntities) {
      const ent = sample.entities.find((e) => e.id === focusId);
      if (!ent?.bbox) continue;
      const focusArea = Math.max(1, ent.bbox.width * ent.bbox.height);
      for (const h of huds) {
        const coverArea = intersectionArea(ent.bbox, h.bbox);
        if (coverArea / focusArea > maxCover) {
          issues.push({
            severity: 'error',
            message: `HUD_COVERS_FOCUS: "${h.id}" menutupi ${Math.round((coverArea / focusArea) * 100)}% entitas "${focusId}"`,
            ref,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * Checks that numbers displayed in HUD follow Indonesian formatting (no English thousands comma like 1,435).
 */
export function checkHudFormatFromTelemetry(samples: TelemetrySample[]): QcIssue[] {
  const issues: QcIssue[] = [];
  const seen = new Set<string>();

  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;
    for (const h of sample.hud) {
      const leakMatch = h.text.match(/\(C\d+\)/);
      if (leakMatch) {
        const key = `${h.id}:leak:${leakMatch[0]}`;
        if (!seen.has(key)) {
          seen.add(key);
          issues.push({
            severity: 'error',
            message: `HUD_CLAIM_ID_LEAK: "${h.id}" membocorkan ID klaim ${leakMatch[0]} ke layar ("${h.text}")`,
            ref,
          });
        }
      }
      const badMatches = h.text.match(/\b\d{1,3}(?:,\d{3})+\b/g);
      if (badMatches && badMatches.length > 0) {
        const key = `${h.id}:${badMatches.join(',')}`;
        if (!seen.has(key)) {
          seen.add(key);
          issues.push({
            severity: 'error',
            message: `HUD_FORMAT_NOT_ID: "${h.id}" memakai format ribuan non-Indonesia (${badMatches.join(', ')}) pada "${h.text}"`,
            ref,
          });
        }
      }
      if (/\b\d+\s*deg\b/i.test(h.text)) {
        const key = `${h.id}:deg`;
        if (!seen.has(key)) {
          seen.add(key);
          issues.push({
            severity: 'error',
            message: `HUD_UNNORMALIZED_UNIT: "${h.id}" menampilkan satuan "deg" (gunakan "°" tanpa spasi) pada "${h.text}"`,
            ref,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * Checks declared assembly geometry constraints in world coordinates across sample frames.
 */
export function checkGeometryFromTelemetry(
  samples: TelemetrySample[],
  spec: VisualCheckSpec
): QcIssue[] {
  const issues: QcIssue[] = [];
  const rules = spec.geometryRules ?? [];
  if (rules.length === 0) return issues;

  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;
    for (const rule of rules) {
      const ent = sample.entities.find((e) => e.id === rule.entity);
      const val = ent?.geometry?.[rule.key];
      if (val === undefined) {
        issues.push({
          severity: 'error',
          message: `GEOMETRY_MISSING: ${rule.entity}.geometry.${rule.key} tidak dilaporkan`,
          ref,
        });
        continue;
      }
      if (rule.op === 'max_abs') {
        const threshold = rule.threshold ?? 0.02;
        if (typeof val !== 'number' || Math.abs(val) > threshold) {
          issues.push({
            severity: 'error',
            message: `GEOMETRY_VIOLATION: ${rule.entity}.${rule.key}=${String(val)} melebihi toleransi ${threshold}`,
            ref,
          });
        }
      } else if (rule.op === 'equals') {
        if (val !== rule.expected) {
          issues.push({
            severity: 'error',
            message: `GEOMETRY_VIOLATION: ${rule.entity}.${rule.key}=${String(val)} (harus ${String(rule.expected)})`,
            ref,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * Checks that declared important 3D sub-parts remain inside safe bounds and are not
 * occluded by HUD panels by more than 25% during their active driver range.
 */
export function checkVisibilityFromTelemetry(
  samples: TelemetrySample[],
  spec: VisualCheckSpec
): QcIssue[] {
  const issues: QcIssue[] = [];
  const exagSeen = new Set<string>();
  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;
    for (const ent of sample.entities) {
      const exag = Number(ent.partStates?.taper_exaggeration ?? 1);
      if (Number.isFinite(exag) && exag > 1) {
        const hasBadge = sample.hud.some(
          (h) => h.component === 'ExaggerationBadge' || /skala\s+dilebihkan/i.test(h.text)
        );
        if (!hasBadge && !exagSeen.has(ent.id)) {
          exagSeen.add(ent.id);
          issues.push({
            severity: 'error',
            message: `VIS_EXAGGERATION_UNLABELED: "${ent.id}" memakai taperExaggeration=${exag} tanpa badge "skala dilebihkan"`,
            ref,
          });
        }
      }
    }
  }

  const parts = spec.visibleParts ?? [];
  if (parts.length === 0) return issues;
  const safe = spec.safeBounds ?? { minX: 0, maxX: 720, minY: 60, maxY: 1220 };

  for (const sample of samples) {
    const ref = `f${sample.frame} (${sample.sec.toFixed(2)}s)`;
    for (const vp of parts) {
      if (vp.whenDriverBetween) {
        const drv = vp.driverName
          ? sample.drivers[vp.driverName]
          : Object.values(sample.drivers)[0];
        if (!drv) continue;
        const [minV, maxV] = vp.whenDriverBetween;
        if (drv.value < minV || drv.value > maxV) continue;
      }

      const ent = sample.entities.find((e) => e.id === vp.entity);
      const pBox = ent?.parts?.[vp.part];
      if (!pBox) {
        issues.push({
          severity: 'error',
          message: `VISIBILITY_MISSING_PART: bagian "${vp.entity}.${vp.part}" tidak dilaporkan di telemetri`,
          ref,
        });
        continue;
      }

      if (
        pBox.width <= 0 ||
        pBox.height <= 0 ||
        pBox.x < safe.minX ||
        pBox.x + pBox.width > safe.maxX ||
        pBox.y < safe.minY ||
        pBox.y + pBox.height > safe.maxY
      ) {
        issues.push({
          severity: 'error',
          message: `VISIBILITY_OUT_OF_BOUNDS: bagian "${vp.entity}.${vp.part}" bbox=[${pBox.x},${pBox.y},${pBox.width}x${pBox.height}] keluar area aman`,
          ref,
        });
        continue;
      }

      const partArea = Math.max(1, pBox.width * pBox.height);
      const maxCover = vp.maxHudCoverRatio ?? 0.25;
      for (const h of sample.hud) {
        const cover = intersectionArea(pBox, h.bbox);
        if (cover / partArea > maxCover) {
          issues.push({
            severity: 'error',
            message: `VISIBILITY_OCCLUDED_BY_HUD: "${vp.entity}.${vp.part}" tertutup HUD "${h.id}" sebesar ${Math.round((cover / partArea) * 100)}% (> ${Math.round(maxCover * 100)}%)`,
            ref,
          });
        }
      }
    }
  }
  return issues;
}
