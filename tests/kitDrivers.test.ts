import { describe, expect, it } from 'vitest';
import {
  formatIdNumber,
  gearRatioAngle,
  solveCrankSlider,
  springOscillation,
  valveStateFromCrankAngle,
  wheelAngleDegFromDistance,
  wheelAngleFromDistance,
} from '../remotion/src/kit/drivers/kinematics';
import {
  computePistonCrankLayout,
  computeWheelsetLayout,
} from '../remotion/src/kit/drivers/geometry';
import {
  checkFramingFromTelemetry,
  checkGeometryFromTelemetry,
  checkHudFormatFromTelemetry,
  checkHudOverlapFromTelemetry,
  checkMechanicsFromTelemetry,
  checkVisibilityFromTelemetry,
} from '@core/qc/visual/checks';
import type { TelemetrySample, VisualCheckSpec } from '@core/qc/visual/types';

describe('Scene Kit pure driver kinematics & Indonesian formatter', () => {
  it('computes gearRatioAngle, wheelAngleFromDistance, and springOscillation accurately', () => {
    expect(gearRatioAngle(Math.PI, 20, 40)).toBeCloseTo(-Math.PI / 2, 6);
    expect(wheelAngleFromDistance(0.92, 0.46)).toBeCloseTo(2.0, 6);
    expect(wheelAngleDegFromDistance(Math.PI * 0.46, 0.46)).toBeCloseTo(180, 4);

    const sTop = springOscillation(Math.PI / 2, 0.8, 0.2);
    expect(sTop.length).toBeCloseTo(1.0, 6);
    expect(sTop.compressionRatio).toBeCloseTo(0, 6);

    const sBot = springOscillation((3 * Math.PI) / 2, 0.8, 0.2);
    expect(sBot.length).toBeCloseTo(0.6, 6);
    expect(sBot.compressionRatio).toBeCloseTo(1, 6);
  });

  it('derives 4-stroke valve states, spark timing, and solveCrankSlider from crank angle', () => {
    const tdc = solveCrankSlider({ crankAngleRad: 0, crankRadius: 0.5, rodLength: 1.5 });
    expect(tdc.strokeRatio).toBeCloseTo(1, 5);
    const bdc = solveCrankSlider({ crankAngleRad: Math.PI, crankRadius: 0.5, rodLength: 1.5 });
    expect(bdc.strokeRatio).toBeCloseTo(0, 5);

    const intake = valveStateFromCrankAngle(90);
    expect(intake.strokePhase).toBe('hisap');
    expect(intake.intakeOpen).toBe(true);
    expect(intake.exhaustOpen).toBe(false);
    expect(intake.sparkOn).toBe(false);

    const comp = valveStateFromCrankAngle(270);
    expect(comp.strokePhase).toBe('kompresi');
    expect(comp.intakeOpen).toBe(false);
    expect(comp.exhaustOpen).toBe(false);

    const powerSpark = valveStateFromCrankAngle(365);
    expect(powerSpark.strokePhase).toBe('usaha');
    expect(powerSpark.sparkOn).toBe(true);

    const exhaust = valveStateFromCrankAngle(630);
    expect(exhaust.strokePhase).toBe('buang');
    expect(exhaust.exhaustOpen).toBe(true);
    expect(exhaust.intakeOpen).toBe(false);
  });

  it('formats numbers with id-ID locale (dots for thousands, commas for decimals)', () => {
    expect(formatIdNumber(1435)).toBe('1.435');
    expect(formatIdNumber(3.5, 1)).toBe('3,5');
  });
});

describe('Visual QC pure telemetry checks', () => {
  const spec: VisualCheckSpec = {
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
      },
      {
        kind: 'hud_matches_driver',
        hudId: 'stat_crank_angle',
        driverName: 'crank_angle',
        tolerance: 1,
      },
    ],
  };

  it('passes clean telemetry sample and catches mechanics, framing, overlap, and format errors', () => {
    const cleanSample: TelemetrySample = {
      frame: 30,
      sec: 1.0,
      drivers: { crank_angle: { value: 90, unit: '°' } },
      entities: [
        {
          id: 'piston_crank',
          role: 'focus',
          bbox: { x: 160, y: 320, width: 400, height: 420 },
          partStates: { intake_valve: 'open' },
        },
      ],
      hud: [
        {
          id: 'stat_crank_angle',
          component: 'StatCounter',
          zone: 'callout',
          bbox: { x: 48, y: 820, width: 624, height: 64 },
          text: 'Sudut Engkol: 90 °',
          driverName: 'crank_angle',
          numericValue: 90,
        },
        {
          id: 'callout_valves',
          component: 'Callout',
          zone: 'callout',
          bbox: { x: 48, y: 896, width: 624, height: 64 },
          text: 'Lebar rel 1.435 mm',
        },
      ],
    };

    expect(checkMechanicsFromTelemetry([cleanSample], spec)).toHaveLength(0);
    expect(checkFramingFromTelemetry([cleanSample], spec)).toHaveLength(0);
    expect(checkHudOverlapFromTelemetry([cleanSample], spec)).toHaveLength(0);
    expect(checkHudFormatFromTelemetry([cleanSample])).toHaveLength(0);

    // Mutate all 4
    const badSample: TelemetrySample = {
      ...cleanSample,
      entities: [
        {
          id: 'piston_crank',
          role: 'focus',
          bbox: { x: -40, y: 320, width: 400, height: 420 },
          partStates: { intake_valve: 'closed' },
        },
      ],
      hud: [
        {
          ...cleanSample.hud[0]!,
          numericValue: 140,
        },
        {
          ...cleanSample.hud[1]!,
          bbox: { x: 48, y: 825, width: 624, height: 64 },
          text: 'Lebar rel 1,435 mm',
        },
      ],
    };

    expect(checkMechanicsFromTelemetry([badSample], spec).length).toBeGreaterThanOrEqual(2);
    expect(checkFramingFromTelemetry([badSample], spec)).toHaveLength(1);
    expect(checkHudOverlapFromTelemetry([badSample], spec)).toHaveLength(1);
    expect(checkHudFormatFromTelemetry([badSample])).toHaveLength(1);
  });

  it('computes pure Wheelset & PistonCrank geometry layouts and catches geometry/visibility/budget violations', () => {
    const wl = computeWheelsetLayout({
      distance: 6,
      lateralShift: 0.14,
      wheelRadius: 0.46,
      gauge: 1.435,
      coneRatio: 0.05,
      curveStartZ: 2,
      curveRadius: 10,
    });
    expect(wl.constraints.leftContactGap).toBeCloseTo(0, 6);
    expect(wl.constraints.rightContactGap).toBeCloseTo(0, 6);
    expect(wl.constraints.axlePerpendicularDot).toBeCloseTo(0, 6);
    expect(wl.constraints.wheelSpacing).toBeCloseTo(1.435, 6);
    expect(wl.constraints.flangesInside).toBe(true);
    expect(wl.rightEffectiveRadius).toBeGreaterThan(wl.leftEffectiveRadius);

    const pc = computePistonCrankLayout({ crankAngleDeg: 120 });
    expect(pc.constraints.rodTopToPistonPinGap).toBeCloseTo(0, 6);
    expect(pc.constraints.rodBottomToCrankPinGap).toBeCloseTo(0, 6);
    expect(pc.constraints.pistonInsideCylinder).toBe(true);

    const geoSpec: VisualCheckSpec = {
      compositionId: 'DemoKereta',
      focusEntities: ['wheelset'],
      maxActiveHudPanels: 2,
      invariants: [],
      geometryRules: [
        { entity: 'wheelset', key: 'left_contact_gap', op: 'max_abs', threshold: 0.01 },
        { entity: 'wheelset', key: 'axle_perpendicular_dot', op: 'max_abs', threshold: 0.02 },
      ],
      visibleParts: [{ entity: 'wheelset', part: 'wheel_left', maxHudCoverRatio: 0.25 }],
    };

    const badSample: TelemetrySample = {
      frame: 15,
      sec: 0.5,
      drivers: { distance: { value: 0, unit: 'm' } },
      entities: [
        {
          id: 'wheelset',
          role: 'focus',
          bbox: { x: 150, y: 350, width: 400, height: 300 },
          parts: { wheel_left: { x: 200, y: 500, width: 120, height: 120 } },
          geometry: { left_contact_gap: 0.05, axle_perpendicular_dot: 1.0 },
        },
      ],
      hud: [
        { id: 'h1', component: 'Callout', zone: 'callout', bbox: { x: 180, y: 480, width: 200, height: 150 }, text: 'A' },
        { id: 'h2', component: 'Callout', zone: 'callout', bbox: { x: 40, y: 900, width: 200, height: 60 }, text: 'B' },
        { id: 'h3', component: 'Callout', zone: 'callout', bbox: { x: 300, y: 900, width: 200, height: 60 }, text: 'C' },
      ],
    };

    expect(checkGeometryFromTelemetry([badSample], geoSpec)).toHaveLength(2);
    expect(checkVisibilityFromTelemetry([badSample], geoSpec)[0]?.message).toContain('VISIBILITY_OCCLUDED_BY_HUD');
    expect(checkHudOverlapFromTelemetry([badSample], geoSpec)[0]?.message).toContain('HUD_BUDGET_EXCEEDED');

    const leakSample: TelemetrySample = {
      ...badSample,
      entities: [{ id: 'wheelset', role: 'focus', bbox: { x: 250, y: 400, width: 200, height: 200 } }],
      hud: [{ id: 'h1', component: 'Callout', zone: 'callout', bbox: { x: 48, y: 860, width: 300, height: 60 }, text: 'Inersia (C2)' }],
    };
    expect(checkHudFormatFromTelemetry([leakSample])[0]?.message).toContain('HUD_CLAIM_ID_LEAK');
    expect(checkFramingFromTelemetry([leakSample], geoSpec)[0]?.message).toContain('FRAMING_TOO_SMALL');
  });
});
