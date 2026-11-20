import React, { useRef } from 'react';
import * as THREE from 'three';
import { computeWheelsetLayout } from './drivers/geometry';
import { TelemetryEntity } from './telemetry/TelemetryEntity';
import { getThemeTokens, type PaletteId } from './tokens/index';
import { WheelsetOnRail } from './assemblies/WheelsetOnRail';

export interface TrainCarProps {
  /** Entity ID for telemetry and framing QC. Defaults to "train_car". */
  entityId?: string;
  /** Travel distance along the Z-axis track (from useDriver). */
  distance?: number;
  /** Optional curve start Z and curve radius (>0 curves toward +X). */
  curveStartZ?: number;
  curveRadius?: number;
  /** Track gauge. Defaults to 1.435. */
  gauge?: number;
  /** Car body length. Defaults to 5.6. */
  length?: number;
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * Low-poly train car aligned along the Z-axis track with front and rear WheelsetOnRail bogies
 * seated flush on the rail heads (`y = 0.22`).
 */
export const TrainCar: React.FC<TrainCarProps> = ({
  entityId = 'train_car',
  distance = 0,
  curveStartZ = 2,
  curveRadius,
  gauge = 1.435,
  length = 5.6,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const bodyRef = useRef<THREE.Group>(null);
  const halfLen = length / 2;
  const bogieOffset = halfLen - 1.1;

  const centerLayout = computeWheelsetLayout({
    distance,
    gauge,
    railHeadTopY: 0.22,
    curveStartZ,
    curveRadius,
  });

  return (
    <TelemetryEntity
      id={entityId}
      role="focus"
      partRefs={{ body: bodyRef }}
      partStates={{ distance: Math.round(distance * 1000) / 1000 }}
      geometry={{
        left_contact_gap: Math.round(centerLayout.constraints.leftContactGap * 10000) / 10000,
        right_contact_gap: Math.round(centerLayout.constraints.rightContactGap * 10000) / 10000,
        axle_perpendicular_dot: Math.round(centerLayout.constraints.axlePerpendicularDot * 10000) / 10000,
        flanges_inside: centerLayout.constraints.flangesInside,
      }}
    >
      <group>
        <WheelsetOnRail
          entityId={`${entityId}_front`}
          role="prop"
          distance={distance + bogieOffset}
          gauge={gauge}
          curveStartZ={curveStartZ}
          curveRadius={curveRadius}
          palette={palette}
        />
        <WheelsetOnRail
          entityId={`${entityId}_rear`}
          role="prop"
          distance={distance - bogieOffset}
          gauge={gauge}
          curveStartZ={curveStartZ}
          curveRadius={curveRadius}
          palette={palette}
        />

        <group
          ref={bodyRef}
          position={[centerLayout.center[0], 0, centerLayout.center[2]]}
          rotation={[0, centerLayout.yawRad, 0]}
        >
          {/* Chassis frame seated above bogies */}
          <mesh position={[0, 1.05, 0]}>
            <boxGeometry args={[1.95, 0.2, length]} />
            <meshStandardMaterial color={tokens.colors.steelDark} metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Main body */}
          <mesh position={[0, 1.88, -0.15]}>
            <boxGeometry args={[1.9, 1.45, length - 0.5]} />
            <meshStandardMaterial
              color={tokens.colors.gridSecondary}
              emissive={tokens.colors.gridPrimary}
              emissiveIntensity={0.22}
              metalness={0.35}
              roughness={0.5}
            />
          </mesh>
          {/* Sloped nose */}
          <mesh position={[0, 1.64, halfLen - 0.1]} rotation={[-0.38, 0, 0]}>
            <boxGeometry args={[1.82, 1.05, 0.85]} />
            <meshStandardMaterial
              color={tokens.colors.gridSecondary}
              emissive={tokens.colors.primary}
              emissiveIntensity={0.2}
              metalness={0.4}
              roughness={0.45}
            />
          </mesh>
          {/* Side accent stripes */}
          {[-0.96, 0.96].map((x, idx) => (
            <mesh key={idx} position={[x, 1.45, -0.15]}>
              <boxGeometry args={[0.03, 0.1, length - 0.4]} />
              <meshStandardMaterial
                color={tokens.colors.primary}
                emissive={tokens.colors.primaryGlow}
                emissiveIntensity={0.6}
              />
            </mesh>
          ))}
        </group>
      </group>
    </TelemetryEntity>
  );
};
