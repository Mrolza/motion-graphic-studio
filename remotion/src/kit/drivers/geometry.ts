import { solveCrankSlider } from '../linkage';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface WheelsetGeometryConstraints {
  leftContactGap: number;
  rightContactGap: number;
  axlePerpendicularDot: number;
  wheelSpacing: number;
  expectedGauge: number;
  flangesInside: boolean;
}

export interface WheelsetLayout {
  center: [number, number, number];
  yawRad: number;
  spinRad: number;
  leftWheelLocalX: number;
  rightWheelLocalX: number;
  leftFlangeLocalX: number;
  rightFlangeLocalX: number;
  leftEffectiveRadius: number;
  rightEffectiveRadius: number;
  leftContactWorld: [number, number, number];
  rightContactWorld: [number, number, number];
  constraints: WheelsetGeometryConstraints;
}

export interface WheelsetLayoutInput {
  distance: number;
  lateralShift?: number;
  wheelRadius?: number;
  gauge?: number;
  coneRatio?: number;
  railHeadTopY?: number;
  /** Optional curve start Z and curve radius (>0 curves toward +X). */
  curveStartZ?: number;
  curveRadius?: number;
  /** Optional vertical lift (for geometry mutation testing). */
  liftY?: number;
  /** Optional yaw offset in radians (for geometry mutation testing). */
  yawOffsetRad?: number;
}

/**
 * Pure kinematic & geometric layout for WheelsetOnRail along a Z-axis straight or curved track.
 * Computes world-space rail contact points, effective radii, and geometry constraints.
 */
export function computeWheelsetLayout({
  distance,
  lateralShift = 0,
  wheelRadius = 0.46,
  gauge = 1.435,
  coneRatio = 0.05,
  railHeadTopY = 0.22,
  curveStartZ = 0,
  curveRadius,
  liftY = 0,
  yawOffsetRad = 0,
}: WheelsetLayoutInput): WheelsetLayout {
  const halfGauge = gauge / 2;
  let trackX = 0;
  let trackZ = distance;
  let trackYaw = 0;

  if (curveRadius && Number.isFinite(curveRadius) && distance > curveStartZ) {
    const arc = distance - curveStartZ;
    const theta = arc / curveRadius;
    trackX = curveRadius * (1 - Math.cos(theta));
    trackZ = curveStartZ + curveRadius * Math.sin(theta);
    trackYaw = -theta; // +Z rotated by -theta around Y points into (+X, +Z)
  }

  // Track normal (pointing right/+X in local frame) and tangent (pointing forward/+Z)
  const cosY = Math.cos(trackYaw);
  const sinY = Math.sin(trackYaw);
  const normalX = cosY;
  const normalZ = -sinY;
  const tangentX = sinY;
  const tangentZ = cosY;

  const wheelCenterY = railHeadTopY + wheelRadius + liftY;
  const centerX = trackX + normalX * lateralShift;
  const centerZ = trackZ + normalZ * lateralShift;
  const totalYaw = trackYaw + yawOffsetRad;

  const aCos = Math.cos(totalYaw);
  const aSin = Math.sin(totalYaw);
  const axleAxisX = aCos;
  const axleAxisZ = -aSin;

  const leftLocalX = -halfGauge;
  const rightLocalX = halfGauge;
  const leftFlangeLocalX = -halfGauge + 0.11;
  const rightFlangeLocalX = halfGauge - 0.11;

  // When lateralShift > 0 (shifted toward +X outer rail), +X wheel rides on larger radius
  const leftEffectiveRadius = Math.max(0.1, wheelRadius - lateralShift * coneRatio);
  const rightEffectiveRadius = Math.max(0.1, wheelRadius + lateralShift * coneRatio);

  const contactY = wheelCenterY - wheelRadius;
  const leftContactWorld: [number, number, number] = [
    centerX + axleAxisX * leftLocalX,
    contactY,
    centerZ + axleAxisZ * leftLocalX,
  ];
  const rightContactWorld: [number, number, number] = [
    centerX + axleAxisX * rightLocalX,
    contactY,
    centerZ + axleAxisZ * rightLocalX,
  ];

  const axlePerpDot = Math.abs(axleAxisX * tangentX + axleAxisZ * tangentZ);

  return {
    center: [centerX, wheelCenterY, centerZ],
    yawRad: totalYaw,
    spinRad: distance / wheelRadius,
    leftWheelLocalX: leftLocalX,
    rightWheelLocalX: rightLocalX,
    leftFlangeLocalX,
    rightFlangeLocalX,
    leftEffectiveRadius,
    rightEffectiveRadius,
    leftContactWorld,
    rightContactWorld,
    constraints: {
      leftContactGap: Math.abs(contactY - railHeadTopY),
      rightContactGap: Math.abs(contactY - railHeadTopY),
      axlePerpendicularDot: axlePerpDot,
      wheelSpacing: Math.abs(rightLocalX - leftLocalX),
      expectedGauge: gauge,
      flangesInside:
        Math.abs(leftFlangeLocalX) < halfGauge && Math.abs(rightFlangeLocalX) < halfGauge,
    },
  };
}

export interface PistonCrankLayout {
  pistonPinWorld: [number, number, number];
  crankPinWorld: [number, number, number];
  rodBottomWorld: [number, number, number];
  rodTopWorld: [number, number, number];
  rodCenterLocal: [number, number, number];
  rodRotationZ: number;
  crankRotationZ: number;
  constraints: {
    rodTopToPistonPinGap: number;
    rodBottomToCrankPinGap: number;
    pistonInsideCylinder: boolean;
  };
}

/**
 * Pure kinematic & geometric layout for PistonCrankAssembly.
 */
export function computePistonCrankLayout(params: {
  crankAngleDeg: number;
  crankRadius?: number;
  rodLength?: number;
  position?: [number, number, number];
  detachRodOffset?: [number, number, number];
}): PistonCrankLayout {
  const crankRadius = params.crankRadius ?? 0.55;
  const rodLength = params.rodLength ?? 1.45;
  const pos = params.position ?? [0, 0.25, 0];
  const detach = params.detachRodOffset ?? [0, 0, 0];

  const sol = solveCrankSlider({
    crankAngleRad: (params.crankAngleDeg * Math.PI) / 180,
    crankRadius,
    rodLength,
    crankCenter: [0, 0, 0],
  });

  const pistonPinWorld: [number, number, number] = [
    pos[0] + sol.pistonPin[0],
    pos[1] + sol.pistonPin[1],
    pos[2] + sol.pistonPin[2],
  ];
  const crankPinWorld: [number, number, number] = [
    pos[0] + sol.crankPin[0],
    pos[1] + sol.crankPin[1],
    pos[2] + sol.crankPin[2],
  ];

  const rodBottomWorld: [number, number, number] = [
    crankPinWorld[0] + detach[0],
    crankPinWorld[1] + detach[1],
    crankPinWorld[2] + detach[2],
  ];
  const rodTopWorld: [number, number, number] = [
    pistonPinWorld[0] + detach[0],
    pistonPinWorld[1] + detach[1],
    pistonPinWorld[2] + detach[2],
  ];

  const gap = (a: [number, number, number], b: [number, number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  const cylBaseY = rodLength - crankRadius - 0.18;
  const cylHeight = crankRadius * 2 + 0.95;

  return {
    pistonPinWorld,
    crankPinWorld,
    rodBottomWorld,
    rodTopWorld,
    rodCenterLocal: [
      sol.rodCenter[0] + detach[0],
      sol.rodCenter[1] + detach[1],
      sol.rodCenter[2] + detach[2],
    ],
    rodRotationZ: sol.rodRotationZ,
    crankRotationZ: sol.crankRotationZ,
    constraints: {
      rodTopToPistonPinGap: gap(rodTopWorld, pistonPinWorld),
      rodBottomToCrankPinGap: gap(rodBottomWorld, crankPinWorld),
      pistonInsideCylinder:
        sol.pistonPin[1] >= cylBaseY && sol.pistonPin[1] + 0.34 <= cylBaseY + cylHeight + 0.1,
    },
  };
}
