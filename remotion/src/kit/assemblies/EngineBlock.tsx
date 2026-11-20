import React, { useRef } from 'react';
import * as THREE from 'three';
import { computePistonCrankLayout } from '../drivers/geometry';
import { TelemetryEntity } from '../telemetry/TelemetryEntity';
import { getThemeTokens, type PaletteId } from '../tokens/index';
import { PistonCrankAssembly } from './PistonCrankAssembly';

export interface EngineBlockProps {
  entityId?: string;
  crankAngleDeg: number;
  /** 0 = solid exterior block, 1 = cutaway revealing PistonCrankAssembly inside. */
  cutawayProgress?: number;
  position?: [number, number, number];
  palette?: PaletteId;
}

/**
 * Exterior 4-stroke engine block with cooling fins that transitions cleanly into cutaway mode.
 */
export const EngineBlock: React.FC<EngineBlockProps> = ({
  entityId = 'engine_block',
  crankAngleDeg,
  cutawayProgress = 0.5,
  position = [0, 0.45, 0],
  palette = 'industrial-orange',
}) => {
  const tokens = getThemeTokens(palette);
  const blockRef = useRef<THREE.Group>(null);
  const shellOpacity = Math.max(0.15, 1 - Math.max(0, Math.min(1, cutawayProgress)) * 0.85);
  const layout = computePistonCrankLayout({ crankAngleDeg, position });

  return (
    <TelemetryEntity
      id={entityId}
      role="focus"
      partRefs={{ block: blockRef }}
      partStates={{ cutaway_progress: Math.round(cutawayProgress * 100) / 100 }}
      geometry={{
        rod_top_gap: Math.round(layout.constraints.rodTopToPistonPinGap * 10000) / 10000,
        rod_bottom_gap: Math.round(layout.constraints.rodBottomToCrankPinGap * 10000) / 10000,
        piston_inside_cylinder: layout.constraints.pistonInsideCylinder,
      }}
    >
      <group>
        <group ref={blockRef} position={position}>
          {/* Exterior block housing */}
          <mesh position={[0, 1.55, 0]}>
            <boxGeometry args={[1.62, 2.25, 1.58]} />
            <meshStandardMaterial
              color={tokens.colors.steelDark}
              metalness={0.65}
              roughness={0.38}
              transparent={shellOpacity < 0.99}
              opacity={shellOpacity}
              depthWrite={shellOpacity >= 0.99}
            />
          </mesh>
          {/* Cooling fins */}
          {[0.9, 1.25, 1.6, 1.95].map((y, idx) => (
            <mesh key={idx} position={[0, y, 0]}>
              <boxGeometry args={[1.84, 0.06, 1.76]} />
              <meshStandardMaterial
                color={tokens.colors.primary}
                emissive={tokens.colors.primary}
                emissiveIntensity={0.2}
                transparent={shellOpacity < 0.99}
                opacity={shellOpacity}
                depthWrite={shellOpacity >= 0.99}
              />
            </mesh>
          ))}
        </group>

        <PistonCrankAssembly
          entityId="piston_crank"
          role="prop"
          crankAngleDeg={crankAngleDeg}
          position={position}
          cutaway
          palette={palette}
        />
      </group>
    </TelemetryEntity>
  );
};
