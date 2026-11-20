export {
  solveCrankSlider,
  crankAngleFromTime,
  type CrankSliderInput,
  type CrankSliderSolution,
} from '../linkage';

export type StrokePhase = 'hisap' | 'kompresi' | 'usaha' | 'buang';

export interface ValveCycleState {
  /** Normalized crank angle within one 4-stroke cycle [0, 720). */
  cycleDeg: number;
  /** Active 4-stroke phase name in Indonesian. */
  strokePhase: StrokePhase;
  /** True when intake valve is open (0 <= cycleDeg < 180). */
  intakeOpen: boolean;
  /** Normalized intake valve lift [0, 1]. */
  intakeLift: number;
  /** True when exhaust valve is open (540 <= cycleDeg < 720). */
  exhaustOpen: boolean;
  /** Normalized exhaust valve lift [0, 1]. */
  exhaustLift: number;
  /** True when spark plug fires near TDC of power stroke (350 <= cycleDeg <= 380). */
  sparkOn: boolean;
}

/**
 * Computes output gear angle in radians from input angle and tooth counts.
 * Opposite sign represents meshing direction reversal.
 */
export function gearRatioAngle(inputAngleRad: number, teethIn: number, teethOut: number): number {
  if (teethOut <= 0) throw new Error('teethOut must be positive');
  return -inputAngleRad * (teethIn / teethOut);
}

/**
 * Computes wheel rotation angle (radians) from linear travel distance and wheel radius.
 * Negative sign rotates clockwise for +X forward motion around Z.
 */
export function wheelAngleFromDistance(distance: number, radius: number): number {
  if (radius <= 0) throw new Error('radius must be positive');
  return distance / radius;
}

/**
 * Computes wheel rotation angle in degrees from linear travel distance and wheel radius.
 */
export function wheelAngleDegFromDistance(distance: number, radius: number): number {
  return (wheelAngleFromDistance(distance, radius) * 180) / Math.PI;
}

/**
 * Computes spring length and normalized compression ratio [0, 1] from phase angle.
 */
export function springOscillation(
  phaseRad: number,
  restLength: number,
  amplitude: number
): { length: number; compressionRatio: number } {
  const offset = Math.sin(phaseRad) * amplitude;
  const length = Math.max(0.05, restLength + offset);
  const compressionRatio = amplitude > 0 ? Math.max(0, Math.min(1, 0.5 - offset / (2 * amplitude))) : 0.5;
  return { length, compressionRatio };
}

/**
 * Derives 4-stroke intake/exhaust valve states, spark timing, and stroke phase
 * purely from crankshaft angle in degrees (0-720 deg cycle).
 */
export function valveStateFromCrankAngle(crankAngleDeg: number): ValveCycleState {
  const wrapped = ((crankAngleDeg % 720) + 720) % 720;
  // Treat exact 720 as end of exhaust when input is 720 and > 0
  const cycleDeg = crankAngleDeg > 0 && wrapped === 0 ? 720 : wrapped;

  let strokePhase: StrokePhase = 'hisap';
  if (cycleDeg >= 540) strokePhase = 'buang';
  else if (cycleDeg >= 360) strokePhase = 'usaha';
  else if (cycleDeg >= 180) strokePhase = 'kompresi';

  const intakeOpen = cycleDeg >= 0 && cycleDeg < 180;
  const intakeLift = intakeOpen ? Math.sin((cycleDeg / 180) * Math.PI) : 0;

  const exhaustOpen = cycleDeg >= 540 && cycleDeg <= 720;
  const exhaustLift = exhaustOpen ? Math.sin(((cycleDeg - 540) / 180) * Math.PI) : 0;

  const sparkOn = cycleDeg >= 350 && cycleDeg <= 380;

  return {
    cycleDeg,
    strokePhase,
    intakeOpen,
    intakeLift,
    exhaustOpen,
    exhaustLift,
    sparkOn,
  };
}

/**
 * Formats numbers according to Indonesian locale (dots for thousands, commas for decimals).
 */
export function formatIdNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Normalizes unit strings (e.g. "deg"/"derajat" -> "°") and formats value + unit in id-ID locale.
 */
export function normalizeUnit(unit?: string): string {
  if (!unit) return '';
  const u = unit.trim();
  if (/^(deg|degree|degrees|derajat)$/i.test(u)) return '°';
  return u;
}

export function formatValueWithUnit(value: number, unit?: string, decimals = 0): string {
  const num = formatIdNumber(value, decimals);
  const u = normalizeUnit(unit);
  if (!u) return num;
  if (u === '°' || u === '%') return `${num}${u}`;
  return `${num} ${u}`;
}

export interface CompareRadiiResult {
  leftRadiusPx: number;
  rightRadiusPx: number;
  outerSide: 'left' | 'right' | 'equal';
  outerRadiusPx: number;
  innerRadiusPx: number;
}

/**
 * Computes exaggerated effective rolling radii (px) for side-by-side comparison.
 */
export function computeEffectiveCompareRadii(
  lateralShift: number,
  maxShift = 0.06
): CompareRadiiResult {
  const base = 42;
  const norm = Math.max(-1, Math.min(1, lateralShift / Math.max(1e-4, maxShift)));
  const delta = Math.abs(norm) * 8;
  if (Math.abs(norm) < 0.05) {
    return {
      leftRadiusPx: base,
      rightRadiusPx: base,
      outerSide: 'equal',
      outerRadiusPx: base,
      innerRadiusPx: base,
    };
  }
  const rightIsOuter = norm > 0;
  const leftRadiusPx = Math.round(rightIsOuter ? base - delta : base + delta);
  const rightRadiusPx = Math.round(rightIsOuter ? base + delta : base - delta);
  return {
    leftRadiusPx,
    rightRadiusPx,
    outerSide: rightIsOuter ? 'right' : 'left',
    outerRadiusPx: Math.max(leftRadiusPx, rightRadiusPx),
    innerRadiusPx: Math.min(leftRadiusPx, rightRadiusPx),
  };
}
