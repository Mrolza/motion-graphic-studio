import React from 'react';
import { wheelAngleDegFromDistance, wheelAngleFromDistance } from '../drivers/kinematics';
import { TelemetryEntity } from '../telemetry/TelemetryEntity';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface WheelsetOnRailProps {
  /** Entity ID for telemetry and framing QC. Defaults to "wheelset". */
  entityId?: string;
  /** Role in framing QC. Defaults to "focus". */
  role?: 'focus' | 'prop';
  /** Linear travel distance along the X-axis track (driven by useDriver). */
  distance?: number;
  /** Lateral shift across the track (Z-axis) to demonstrate self-centering. */
  lateralShift?: number;
  /** Wheel tread radius in scene units. Defaults to 0.46. */
  wheelRadius?: number;
  /** Track gauge (distance between left and right rail centers). Defaults to 1.435. */
  gauge?: number;
  /** Conical taper ratio (e.g. 0.05 for 1:20). */
  coneRatio?: number;
  /** Highlight contact patches between wheel tread and rail head. */
  highlightContact?: boolean;
  /** Optional cutaway transparency on wheelset. */
  cutaway?: boolean;
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * Conical wheelset seated flush on twin rail heads, with rotation strictly
 * derived from linear travel distance (`angle = distance / wheelRadius`).
 */
export const WheelsetOnRail: React.FC<WheelsetOnRailProps> = ({
  entityId = 'wheelset',
  role = 'focus',
  distance = 0,
  lateralShift = 0,
  wheelRadius = 0.46,
  gauge = 1.435,
  coneRatio = 0.05,
  highlightContact = false,
  cutaway = false,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const railHeadTopY = 0.14;
  const wheelCenterY = railHeadTopY + wheelRadius;
  const halfGauge = gauge / 2;
  const spinRad = -wheelAngleFromDistance(distance, wheelRadius);
  const wheelAngleDeg = Math.round(wheelAngleDegFromDistance(distance, wheelRadius) * 100) / 100;

  const outerRadius = wheelRadius - 0.04 * coneRatio;
  const innerRadius = wheelRadius + 0.04 * coneRatio;
  const flangeRadius = wheelRadius + 0.075;

  return (
    <TelemetryEntity
      id={entityId}
      role={role}
      partStates={{
        distance: Math.round(distance * 1000) / 1000,
        wheel_angle_deg: wheelAngleDeg,
        lateral_shift: Math.round(lateralShift * 1000) / 1000,
        on_rail: true,
      }}
    >
      <group position={[distance, wheelCenterY, lateralShift]}>
        {/* Rigid steel axle */}
        <mesh rotation={[Math.PI / 2, 0, spinRad]}>
          <cylinderGeometry args={[0.075, 0.075, gauge + 0.32, 24]} />
          <meshStandardMaterial
            color={tokens.colors.steelDark}
            metalness={0.75}
            roughness={0.35}
            transparent={cutaway}
            opacity={cutaway ? 0.4 : 1}
          />
        </mesh>

        {([-1, 1] as const).map((side) => {
          const zWheel = side * halfGauge;
          const zFlange = side * (halfGauge - 0.095);
          const treadRotX = side > 0 ? Math.PI / 2 : -Math.PI / 2;
          return (
            <group key={side}>
              {/* Conical wheel tread */}
              <group position={[0, 0, zWheel]} rotation={[0, 0, spinRad]}>
                <mesh rotation={[treadRotX, 0, 0]}>
                  <cylinderGeometry args={[outerRadius, innerRadius, 0.13, 32]} />
                  <meshStandardMaterial
                    color={tokens.colors.steelLight}
                    metalness={0.65}
                    roughness={0.3}
                    transparent={cutaway}
                    opacity={cutaway ? 0.35 : 1}
                  />
                </mesh>
                {/* Radial spoke marker to make rotation visually unmistakable */}
                <mesh position={[0, wheelRadius * 0.45, side * 0.072]}>
                  <boxGeometry args={[0.045, wheelRadius * 0.72, 0.014]} />
                  <meshStandardMaterial
                    color={tokens.colors.primary}
                    emissive={tokens.colors.primary}
                    emissiveIntensity={0.65}
                  />
                </mesh>
              </group>

              {/* Inner flange (offset laterally to avoid z-fighting with tread) */}
              <mesh position={[0, 0, zFlange]} rotation={[Math.PI / 2, 0, spinRad]}>
                <cylinderGeometry args={[flangeRadius, flangeRadius, 0.032, 32]} />
                <meshStandardMaterial
                  color={tokens.colors.accent}
                  emissive={tokens.colors.accent}
                  emissiveIntensity={0.2}
                  metalness={0.5}
                  roughness={0.35}
                  polygonOffset
                  polygonOffsetFactor={-1}
                />
              </mesh>

              {/* Contact patch ring at rail head */}
              {highlightContact ? (
                <mesh position={[0, -wheelRadius + 0.015, zWheel]}>
                  <sphereGeometry args={[0.048, 16, 16]} />
                  <meshStandardMaterial
                    color={tokens.colors.accentWarm}
                    emissive={tokens.colors.accent}
                    emissiveIntensity={1.1}
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
