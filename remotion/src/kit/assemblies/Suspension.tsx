import React, { useMemo } from 'react';
import * as THREE from 'three';
import { springOscillation } from '../drivers/kinematics';
import { TelemetryEntity } from '../telemetry/TelemetryEntity';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface SuspensionProps {
  /** Entity ID for telemetry and framing QC. Defaults to "suspension". */
  entityId?: string;
  /** Role in framing QC. Defaults to "prop". */
  role?: 'focus' | 'prop';
  /** World-space position of the lower axle mount. */
  position?: [number, number, number];
  /** Oscillation phase in radians (from useDriver). */
  phaseRad?: number;
  /** Uncompressed spring height. Defaults to 0.75. */
  restLength?: number;
  /** Stroke amplitude. Defaults to 0.14. */
  amplitude?: number;
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * Coil spring + telescopic damper anchored flush between an axle mount and an upper bogie frame.
 */
export const Suspension: React.FC<SuspensionProps> = ({
  entityId = 'suspension',
  role = 'prop',
  position = [0, 0.6, 0],
  phaseRad = 0,
  restLength = 0.75,
  amplitude = 0.14,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const { length, compressionRatio } = springOscillation(phaseRad, restLength, amplitude);

  const springGeometry = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const turns = 5;
    const steps = 60;
    const radius = 0.14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(angle) * radius, t * length, Math.sin(angle) * radius));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 60, 0.024, 8, false);
  }, [length]);

  return (
    <TelemetryEntity
      id={entityId}
      role={role}
      partStates={{
        spring_length: Math.round(length * 1000) / 1000,
        compression_ratio: Math.round(compressionRatio * 1000) / 1000,
      }}
    >
      <group position={position}>
        {/* Lower axle bracket */}
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.38, 0.08, 0.38]} />
          <meshStandardMaterial color={tokens.colors.steelDark} metalness={0.7} roughness={0.35} />
        </mesh>

        {/* Coil spring */}
        <mesh geometry={springGeometry}>
          <meshStandardMaterial
            color={tokens.colors.primary}
            emissive={tokens.colors.primary}
            emissiveIntensity={0.35}
            metalness={0.6}
            roughness={0.3}
          />
        </mesh>

        {/* Inner damper rod */}
        <mesh position={[0, length / 2, 0]}>
          <cylinderGeometry args={[0.04, 0.04, length, 16]} />
          <meshStandardMaterial color={tokens.colors.steelLight} metalness={0.8} roughness={0.25} />
        </mesh>

        {/* Upper bogie frame mount */}
        <mesh position={[0, length + 0.05, 0]}>
          <boxGeometry args={[0.48, 0.1, 0.42]} />
          <meshStandardMaterial color={tokens.colors.steel} metalness={0.65} roughness={0.35} />
        </mesh>
      </group>
    </TelemetryEntity>
  );
};
