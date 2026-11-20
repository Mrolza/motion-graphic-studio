import React, { useRef } from 'react';
import * as THREE from 'three';
import { computeWheelsetLayout } from '../drivers/geometry';
import { TelemetryEntity } from '../telemetry/TelemetryEntity';
import { getThemeTokens, type PaletteId } from '../tokens/index';
import { WheelsetOnRail } from './WheelsetOnRail';

export interface RailCrossSectionProps {
  entityId?: string;
  lateralShift?: number;
  gauge?: number;
  taperExaggeration?: number;
  palette?: PaletteId;
}

/**
 * Cross-section profile of twin rail heads + conical wheelset showing taper slope and inner flanges.
 */
export const RailCrossSection: React.FC<RailCrossSectionProps> = ({
  entityId = 'rail_cross_section',
  lateralShift = 0,
  gauge = 1.435,
  taperExaggeration = 5,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const railLeftRef = useRef<THREE.Mesh>(null);
  const railRightRef = useRef<THREE.Mesh>(null);
  const halfGauge = gauge / 2;

  const layout = computeWheelsetLayout({
    distance: 0,
    lateralShift,
    gauge,
    coneRatio: 0.05,
    railHeadTopY: 0.22,
  });

  return (
    <TelemetryEntity
      id={entityId}
      role="focus"
      partRefs={{ rail_left: railLeftRef, rail_right: railRightRef }}
      partStates={{ lateral_shift: Math.round(lateralShift * 1000) / 1000 }}
      geometry={{
        left_contact_gap: Math.round(layout.constraints.leftContactGap * 10000) / 10000,
        right_contact_gap: Math.round(layout.constraints.rightContactGap * 10000) / 10000,
        flanges_inside: layout.constraints.flangesInside,
      }}
    >
      <group>
        {/* Cross-section rail profiles (short Z slice) */}
        {([-halfGauge, halfGauge] as const).map((x, idx) => (
          <group key={idx} position={[x, 0.11, 0]}>
            <mesh ref={idx === 0 ? railLeftRef : railRightRef} position={[0, 0.08, 0]}>
              <boxGeometry args={[0.11, 0.06, 0.6]} />
              <meshStandardMaterial
                color={tokens.colors.accent}
                emissive={tokens.colors.accent}
                emissiveIntensity={0.45}
              />
            </mesh>
            <mesh position={[0, -0.02, 0]}>
              <boxGeometry args={[0.05, 0.14, 0.6]} />
              <meshStandardMaterial color={tokens.colors.steel} metalness={0.7} roughness={0.3} />
            </mesh>
          </group>
        ))}
        {/* Sleeper cross-section */}
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[gauge + 0.8, 0.06, 0.5]} />
          <meshStandardMaterial color={tokens.colors.gridSecondary} />
        </mesh>

        <WheelsetOnRail
          entityId="wheelset"
          role="prop"
          distance={0}
          lateralShift={lateralShift}
          gauge={gauge}
          taperExaggeration={taperExaggeration}
          highlightContact
          palette={palette}
        />
      </group>
    </TelemetryEntity>
  );
};
