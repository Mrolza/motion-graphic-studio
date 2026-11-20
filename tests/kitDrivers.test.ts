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
  checkFramingFromTelemetry,
  checkHudFormatFromTelemetry,
  checkHudOverlapFromTelemetry,
  checkMechanicsFromTelemetry,
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
});
