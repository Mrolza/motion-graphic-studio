import type { QcReport } from '@core/contracts/qc-report';

export interface ScreenBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TelemetryEntitySample {
  id: string;
  role: 'focus' | 'prop';
  bbox?: ScreenBox;
  parts?: Record<string, ScreenBox>;
  partStates?: Record<string, string | number | boolean>;
  geometry?: Record<string, number | boolean>;
}

export interface TelemetryHudSample {
  id: string;
  hud_id?: string;
  component: string;
  zone: 'title' | 'free' | 'callout' | 'caption';
  bbox: ScreenBox;
  text: string;
  driverName?: string;
  numericValue?: number;
  claimRef?: string;
}

export interface ExpectedHudSpec {
  hud_id: string;
  component: string;
  expectedText: string;
  claim_ref?: string;
  claimValue?: number;
  claimUnit?: string;
  claimAllowedNumbers?: number[];
  bind_to_driver?: boolean;
  quantity?: string;
  display?: 'value' | 'qualitative';
  when?: { driver_between: [number, number] };
}

export interface TelemetrySample {
  frame: number;
  sec: number;
  drivers: Record<string, { value: number; unit: string }>;
  entities: TelemetryEntitySample[];
  hud: TelemetryHudSample[];
}

export type VisualInvariant =
  | {
      kind: 'driver_state';
      entity: string;
      stateKey: string;
      expectedValue: string | number | boolean;
      /** Inclusive range [min, max] of driver value where invariant holds. */
      whenDriverBetween: [number, number];
      driverName?: string;
      /** Optional boundary margin to avoid exact boundary ambiguity. */
      epsilon?: number;
    }
  | {
      kind: 'hud_matches_driver';
      hudId: string;
      driverName: string;
      tolerance?: number;
    }
  | {
      kind: 'wheel_angle_matches_distance';
      entity: string;
      radius: number;
      toleranceDeg?: number;
    };

export interface VisiblePartSpec {
  entity: string;
  part: string;
  /** Optional driver range [min, max] when this part must be visible. */
  whenDriverBetween?: [number, number];
  driverName?: string;
  maxHudCoverRatio?: number;
}

export interface GeometryRule {
  entity: string;
  key: string;
  /** 'max_abs' checks <= threshold; 'equals' checks === expected. */
  op: 'max_abs' | 'equals';
  threshold?: number;
  expected?: boolean | number;
}

export interface VisualCheckSpec {
  compositionId: string;
  focusEntities: string[];
  invariants: VisualInvariant[];
  visibleParts?: VisiblePartSpec[];
  geometryRules?: GeometryRule[];
  maxActiveHudPanels?: number;
  expectedHud?: ExpectedHudSpec[];
  syncTargetSec?: number;
  syncToleranceSec?: number;
  shotType?: string;
  usesFrameEntities?: boolean;
  minSubjectFillRatio?: number;
  requireFillError?: boolean;
  safeBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  maxHudOverlapRatio?: number;
}

export interface VisualQcResult {
  compositionId: string;
  passed: boolean;
  sampleCount: number;
  renderMs: number;
  reports: {
    mechanics: QcReport;
    geometry: QcReport;
    visibility: QcReport;
    framing: QcReport;
    hudOverlap: QcReport;
    hudFormat: QcReport;
    onscreenTruth: QcReport;
    sync: QcReport;
    blank: QcReport;
  };
}
