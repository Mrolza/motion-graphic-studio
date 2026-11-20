import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { computeWheelsetLayout } from '../drivers/geometry';
import { TelemetryEntity } from '../telemetry/TelemetryEntity';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface WheelsetOnRailProps {
  /** Entity ID for telemetry and framing QC. Defaults to "wheelset". */
  entityId?: string;
  /** Role in framing QC. Defaults to "focus". */
  role?: 'focus' | 'prop';
  /** Linear travel distance along the Z-axis track (driven by useDriver). */
  distance?: number;
  /** Lateral shift across the track (X-axis, > 0 shifts toward outer right rail). */
  lateralShift?: number;
  /** Wheel tread radius in scene units. Defaults to 0.46. */
  wheelRadius?: number;
  /** Track gauge (distance between left and right rail centers). Defaults to 1.435. */
  gauge?: number;
  /** Conical taper ratio (e.g. 0.05 for 1:20). */
  coneRatio?: number;
  /** Multiplier to exaggerate conical slope visually (e.g. 5). */
  taperExaggeration?: number;
  /** Optional curve start Z and curve radius (>0 curves toward +X). */
  curveStartZ?: number;
  curveRadius?: number;
  /** Highlight contact patches between wheel tread and rail head. */
  highlightContact?: boolean;
  /** Show effective diameter rings on outer vs inner wheel. */
  showEffectiveDiameter?: boolean;
  /** Optional cutaway transparency on wheelset. */
  cutaway?: boolean;
  /** Optional vertical lift (ONLY for geometry mutation testing). */
  liftY?: number;
  /** Optional yaw offset in radians (ONLY for geometry mutation testing). */
  yawOffsetRad?: number;
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * Conical wheelset seated flush on twin Z-axis rail heads, with solid conical
 * lathe tread + integral inner flange, perpendicular axle, and rotation from distance.
 */
export const WheelsetOnRail: React.FC<WheelsetOnRailProps> = ({
  entityId = 'wheelset',
  role = 'focus',
  distance = 0,
  lateralShift = 0,
  wheelRadius = 0.46,
  gauge = 1.435,
  coneRatio = 0.05,
  taperExaggeration = 1,
  curveStartZ = 2,
  curveRadius,
  highlightContact = false,
  showEffectiveDiameter = false,
  cutaway = false,
  liftY = 0,
  yawOffsetRad = 0,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const wheelLeftRef = useRef<THREE.Group>(null);
  const wheelRightRef = useRef<THREE.Group>(null);
  const contactLeftRef = useRef<THREE.Mesh>(null);
  const contactRightRef = useRef<THREE.Mesh>(null);
  const flangeRef = useRef<THREE.Mesh>(null);

  const layout = computeWheelsetLayout({
    distance,
    lateralShift,
    wheelRadius,
    gauge,
    coneRatio,
    railHeadTopY: 0.22,
    curveStartZ,
    curveRadius,
    liftY,
    yawOffsetRad,
  });

  const slopeDelta = Math.min(0.16, 0.025 * taperExaggeration);
  const outerR = Math.max(0.24, wheelRadius - slopeDelta);
  const innerR = wheelRadius + slopeDelta;
  const flangeRadius = innerR + 0.095;
  const wheelAngleDeg = Math.round(((layout.spinRad * 180) / Math.PI) * 100) / 100;

  // Solid lathe profile: Y in lathe = axial coordinate (0 at inner flange -> +0.28 at outer tread)
  const solidTreadGeo = useMemo(() => {
    const pts = [
      new THREE.Vector2(0.06, -0.14),
      new THREE.Vector2(innerR, -0.14),
      new THREE.Vector2(outerR, 0.14),
      new THREE.Vector2(0.06, 0.14),
    ];
    return new THREE.LatheGeometry(pts, 36);
  }, [innerR, outerR]);

  return (
    <TelemetryEntity
      id={entityId}
      role={role}
      partRefs={{
        wheel_left: wheelLeftRef,
        wheel_right: wheelRightRef,
        contact_left: contactLeftRef,
        contact_right: contactRightRef,
        flange: flangeRef,
      }}
      partStates={{
        distance: Math.round(distance * 1000) / 1000,
        wheel_angle_deg: wheelAngleDeg,
        lateral_shift: Math.round(lateralShift * 1000) / 1000,
        left_effective_radius: Math.round(layout.leftEffectiveRadius * 1000) / 1000,
        right_effective_radius: Math.round(layout.rightEffectiveRadius * 1000) / 1000,
      }}
      geometry={{
        left_contact_gap: Math.round(layout.constraints.leftContactGap * 10000) / 10000,
        right_contact_gap: Math.round(layout.constraints.rightContactGap * 10000) / 10000,
        axle_perpendicular_dot: Math.round(layout.constraints.axlePerpendicularDot * 10000) / 10000,
        wheel_spacing_err:
          Math.round(Math.abs(layout.constraints.wheelSpacing - layout.constraints.expectedGauge) * 10000) /
          10000,
        flanges_inside: layout.constraints.flangesInside,
      }}
    >
      <group position={layout.center} rotation={[0, layout.yawRad, 0]}>
        {/* Rigid steel axle along local X */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.065, 0.065, gauge + 0.36, 24]} />
          <meshStandardMaterial
            color={tokens.colors.steelDark}
            metalness={0.75}
            roughness={0.35}
            transparent={cutaway}
            opacity={cutaway ? 0.45 : 1}
          />
        </mesh>

        {([-1, 1] as const).map((side) => {
          const isRight = side > 0;
          const xWheel = isRight ? layout.rightWheelLocalX : layout.leftWheelLocalX;
          const xFlange = isRight ? layout.rightFlangeLocalX : layout.leftFlangeLocalX;
          const treadRotZ = isRight ? -Math.PI / 2 : Math.PI / 2;
          // Exaggerated effective diameter rings when lateralShift > 0
          const visualRingR = isRight ? wheelRadius + 0.12 : wheelRadius - 0.14;

          return (
            <group key={side}>
              {/* Solid conical wheel tread (rotates around X to roll along Z) */}
              <group
                ref={isRight ? wheelRightRef : wheelLeftRef}
                position={[xWheel, 0, 0]}
                rotation={[layout.spinRad, 0, 0]}
              >
                <mesh geometry={solidTreadGeo} rotation={[0, 0, treadRotZ]}>
                  <meshStandardMaterial
                    color={tokens.colors.steelLight}
                    metalness={0.55}
                    roughness={0.35}
                    transparent={cutaway}
                    opacity={cutaway ? 0.4 : 1}
                  />
                </mesh>
                {/* Radial spoke marker */}
                <mesh position={[side * 0.15, wheelRadius * 0.4, 0]}>
                  <boxGeometry args={[0.016, wheelRadius * 0.65, 0.055]} />
                  <meshStandardMaterial
                    color={tokens.colors.primary}
                    emissive={tokens.colors.primary}
                    emissiveIntensity={0.8}
                  />
                </mesh>
              </group>

              {/* Solid integral inner flange */}
              <mesh
                ref={isRight ? undefined : flangeRef}
                position={[xFlange, 0, 0]}
                rotation={[layout.spinRad, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[flangeRadius, flangeRadius, 0.045, 36]} />
                <meshStandardMaterial
                  color={tokens.colors.accent}
                  emissive={tokens.colors.accent}
                  emissiveIntensity={0.28}
                  metalness={0.5}
                  roughness={0.35}
                  polygonOffset
                  polygonOffsetFactor={-1}
                />
              </mesh>

              {/* Contact patch marker at rail head */}
              <mesh
                ref={isRight ? contactRightRef : contactLeftRef}
                position={[xWheel, -wheelRadius + 0.015, 0]}
              >
                <sphereGeometry args={[highlightContact ? 0.055 : 0.025, 16, 16]} />
                <meshStandardMaterial
                  color={tokens.colors.accentWarm}
                  emissive={tokens.colors.accent}
                  emissiveIntensity={highlightContact ? 1.2 : 0.2}
                />
              </mesh>

              {/* Exaggerated effective diameter ring on outer vs inner wheel */}
              {showEffectiveDiameter ? (
                <mesh position={[xWheel + side * 0.06, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                  <torusGeometry args={[visualRingR, isRight ? 0.038 : 0.022, 12, 36]} />
                  <meshStandardMaterial
                    color={isRight ? tokens.colors.accentWarm : tokens.colors.primaryGlow}
                    emissive={isRight ? tokens.colors.accent : tokens.colors.primary}
                    emissiveIntensity={1.25}
                  />
                </mesh>
              ) : null}
            </group>
          );
        })}
      </group>
    </TelemetryEntity>
  );
};
