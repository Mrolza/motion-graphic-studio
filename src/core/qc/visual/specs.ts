import type { VisualCheckSpec } from './types';

export const DEMO_KERETA_SPEC: VisualCheckSpec = {
  compositionId: 'DemoKereta',
  focusEntities: ['wheelset'],
  invariants: [
    {
      kind: 'wheel_angle_matches_distance',
      entity: 'wheelset',
      radius: 0.46,
      toleranceDeg: 1.5,
    },
    {
      kind: 'hud_matches_driver',
      hudId: 'stat_distance',
      driverName: 'distance',
      tolerance: 0.5,
    },
  ],
};

export const DEMO_MESIN_SPEC: VisualCheckSpec = {
  compositionId: 'DemoMesin',
  focusEntities: ['piston_crank'],
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
};

const BUILTIN_SPECS: Record<string, VisualCheckSpec> = {
  DemoKereta: DEMO_KERETA_SPEC,
  DemoMesin: DEMO_MESIN_SPEC,
};

export function getVisualCheckSpec(compositionId: string): VisualCheckSpec | undefined {
  return BUILTIN_SPECS[compositionId];
}
