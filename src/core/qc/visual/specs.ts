import type { VisualCheckSpec } from './types';

export const DEMO_KERETA_SPEC: VisualCheckSpec = {
  compositionId: 'DemoKereta',
  focusEntities: ['wheelset'],
  maxActiveHudPanels: 2,
  invariants: [
    {
      kind: 'wheel_angle_matches_distance',
      entity: 'wheelset',
      radius: 0.46,
      toleranceDeg: 1.5,
    },
  ],
  geometryRules: [
    { entity: 'wheelset', key: 'left_contact_gap', op: 'max_abs', threshold: 0.01 },
    { entity: 'wheelset', key: 'right_contact_gap', op: 'max_abs', threshold: 0.01 },
    { entity: 'wheelset', key: 'axle_perpendicular_dot', op: 'max_abs', threshold: 0.02 },
    { entity: 'wheelset', key: 'wheel_spacing_err', op: 'max_abs', threshold: 0.01 },
    { entity: 'wheelset', key: 'flanges_inside', op: 'equals', expected: true },
  ],
  visibleParts: [
    { entity: 'wheelset', part: 'wheel_left', maxHudCoverRatio: 0.25 },
    { entity: 'wheelset', part: 'wheel_right', maxHudCoverRatio: 0.25 },
    { entity: 'wheelset', part: 'contact_left', maxHudCoverRatio: 0.25 },
    { entity: 'wheelset', part: 'contact_right', maxHudCoverRatio: 0.25 },
    { entity: 'wheelset', part: 'flange', maxHudCoverRatio: 0.25 },
  ],
};

export const DEMO_MESIN_SPEC: VisualCheckSpec = {
  compositionId: 'DemoMesin',
  focusEntities: ['piston_crank'],
  maxActiveHudPanels: 2,
  invariants: [
    {
      kind: 'driver_state',
      entity: 'piston_crank',
      stateKey: 'intake_valve',
      expectedValue: 'open',
      whenDriverBetween: [0, 180],
      driverName: 'crank_angle',
      epsilon: 4,
    },
    {
      kind: 'driver_state',
      entity: 'piston_crank',
      stateKey: 'intake_valve',
      expectedValue: 'closed',
      whenDriverBetween: [180, 720],
      driverName: 'crank_angle',
      epsilon: 4,
    },
    {
      kind: 'driver_state',
      entity: 'piston_crank',
      stateKey: 'exhaust_valve',
      expectedValue: 'closed',
      whenDriverBetween: [0, 540],
      driverName: 'crank_angle',
      epsilon: 4,
    },
    {
      kind: 'driver_state',
      entity: 'piston_crank',
      stateKey: 'exhaust_valve',
      expectedValue: 'open',
      whenDriverBetween: [540, 720],
      driverName: 'crank_angle',
      epsilon: 4,
    },
    {
      kind: 'driver_state',
      entity: 'piston_crank',
      stateKey: 'spark',
      expectedValue: 'on',
      whenDriverBetween: [350, 380],
      driverName: 'crank_angle',
      epsilon: 2,
    },
    {
      kind: 'hud_matches_driver',
      hudId: 'stat_crank_angle',
      driverName: 'crank_angle',
      tolerance: 1.5,
    },
  ],
  geometryRules: [
    { entity: 'piston_crank', key: 'rod_top_gap', op: 'max_abs', threshold: 0.01 },
    { entity: 'piston_crank', key: 'rod_bottom_gap', op: 'max_abs', threshold: 0.01 },
    { entity: 'piston_crank', key: 'piston_inside_cylinder', op: 'equals', expected: true },
  ],
  visibleParts: [
    { entity: 'piston_crank', part: 'piston', maxHudCoverRatio: 0.25 },
    { entity: 'piston_crank', part: 'crank', maxHudCoverRatio: 0.25 },
    {
      entity: 'piston_crank',
      part: 'intake_valve',
      whenDriverBetween: [0, 180],
      driverName: 'crank_angle',
      maxHudCoverRatio: 0.25,
    },
    {
      entity: 'piston_crank',
      part: 'exhaust_valve',
      whenDriverBetween: [540, 720],
      driverName: 'crank_angle',
      maxHudCoverRatio: 0.25,
    },
    {
      entity: 'piston_crank',
      part: 'spark_plug',
      whenDriverBetween: [340, 390],
      driverName: 'crank_angle',
      maxHudCoverRatio: 0.25,
    },
  ],
};

const BUILTIN_SPECS: Record<string, VisualCheckSpec> = {
  DemoKereta: DEMO_KERETA_SPEC,
  DemoMesin: DEMO_MESIN_SPEC,
};

export function getVisualCheckSpec(compositionId: string): VisualCheckSpec | undefined {
  return BUILTIN_SPECS[compositionId];
}
