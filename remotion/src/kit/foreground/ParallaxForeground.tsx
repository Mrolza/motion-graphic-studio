import React from 'react';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface ParallaxForegroundProps {
  /** Travel distance (from useDriver) that scrolls foreground poles & markers past camera. */
  distance?: number;
  /** Spacing between foreground poles along X. Defaults to 4.5. */
  poleSpacing?: number;
  /** Number of pole pairs to render. Defaults to 5. */
  poleCount?: number;
  /** Z distance from track center. Defaults to 2.2. */
  zOffset?: number;
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * Foreground parallax elements (trackside poles, depth markers, floating particles)
 * that give 3D scenes spatial depth.
 */
export const ParallaxForeground: React.FC<ParallaxForegroundProps> = ({
  distance = 0,
  poleSpacing = 4.5,
  poleCount = 5,
  zOffset = 2.2,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const startIdx = Math.floor(distance / poleSpacing) - 1;
  const indices = Array.from({ length: poleCount }, (_, i) => startIdx + i);

  return (
    <group>
      {indices.map((idx) => {
        const z = idx * poleSpacing;
        return (
          <group key={idx} position={[zOffset, 0, z]}>
            {/* Vertical foreground gantry pole */}
            <mesh position={[0, 1.3, 0]}>
              <cylinderGeometry args={[0.035, 0.045, 2.6, 12]} />
              <meshStandardMaterial
                color={tokens.colors.steelDark}
                metalness={0.6}
                roughness={0.4}
                transparent
                opacity={0.72}
              />
            </mesh>
            {/* Glowing beacon strip */}
            <mesh position={[0, 2.45, 0]}>
              <boxGeometry args={[0.14, 0.06, 0.14]} />
              <meshStandardMaterial
                color={tokens.colors.primary}
                emissive={tokens.colors.primaryGlow}
                emissiveIntensity={0.8}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};
