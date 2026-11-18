export interface CrankSliderInput {
  /** Crank angle in radians. 0 = Top Dead Center (TDC), PI = Bottom Dead Center (BDC). */
  crankAngleRad: number;
  /** Crank throw radius (half of total piston stroke). */
  crankRadius: number;
  /** Connecting rod length (must be > crankRadius). */
  rodLength: number;
  /** World-space center of the crankshaft [x, y, z]. Defaults to [0, 0, 0]. */
  crankCenter?: [number, number, number];
}

export interface CrankSliderSolution {
  crankPin: [number, number, number];
  pistonPin: [number, number, number];
  rodCenter: [number, number, number];
  rodRotationZ: number;
  crankRotationZ: number;
  /** 1 at TDC, 0 at BDC. */
  strokeRatio: number;
}

/**
 * Exact kinematic solver for a vertical crank-slider mechanism in the XY plane.
 * Piston moves along X = crankCenter[0]; crankshaft rotates around Z.
 */
export function solveCrankSlider({
  crankAngleRad,
  crankRadius,
  rodLength,
  crankCenter = [0, 0, 0],
}: CrankSliderInput): CrankSliderSolution {
  const [cx, cy, cz] = crankCenter;
  const sinA = Math.sin(crankAngleRad);
  const cosA = Math.cos(crankAngleRad);

  const relCrankX = crankRadius * sinA;
  const relCrankY = crankRadius * cosA;

  const underRoot = Math.max(0.0001, rodLength * rodLength - relCrankX * relCrankX);
  const relPistonY = relCrankY + Math.sqrt(underRoot);

  const dy = relPistonY - relCrankY;
  // Cylinder oriented along +Y rotated by rotationZ points along (-sin(rz), cos(rz), 0).
  const rodRotationZ = Math.atan2(relCrankX, dy);

  const minY = rodLength - crankRadius;
  const maxY = rodLength + crankRadius;
  const strokeRatio = Math.max(0, Math.min(1, (relPistonY - minY) / (maxY - minY)));

  return {
    crankPin: [cx + relCrankX, cy + relCrankY, cz],
    pistonPin: [cx, cy + relPistonY, cz],
    rodCenter: [cx + relCrankX * 0.5, cy + (relCrankY + relPistonY) * 0.5, cz],
    rodRotationZ,
    crankRotationZ: -crankAngleRad,
    strokeRatio,
  };
}

/**
 * Computes crank angle (radians) from scene time in seconds.
 */
export function crankAngleFromTime(
  sec: number,
  startSec = 0,
  durationSec = 999,
  rps = 0.5,
  initialAngleRad = 0
): number {
  const activeSec = Math.max(0, Math.min(sec - startSec, durationSec));
  return initialAngleRad + activeSec * rps * Math.PI * 2;
}
