import React, { useMemo } from 'react';
import * as THREE from 'three';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface CurvedRailProps {
  /** Straight approach start Z. Defaults to -10. */
  startZ?: number;
  /** Z coordinate where the curve begins. Defaults to 2. */
  curveStartZ?: number;
  /** Curve radius in scene units (> 0 curves toward +X). Defaults to 10. */
  curveRadius?: number;
  /** Curve arc length. Defaults to 14. */
  curveLength?: number;
  /** Track gauge (center-to-center of left and right rails). Defaults to 1.435. */
  gauge?: number;
  /** Highlight rails. */
  highlighted?: boolean;
  /** Palette token ID. */
  palette?: PaletteId;
}

interface TrackFrame {
  x: number;
  z: number;
  yaw: number;
}

function sampleTrack(
  s: number,
  curveStartZ: number,
  curveRadius: number
): TrackFrame {
  if (s <= curveStartZ) {
    return { x: 0, z: s, yaw: 0 };
  }
  const arc = s - curveStartZ;
  const theta = arc / curveRadius;
  return {
    x: curveRadius * (1 - Math.cos(theta)),
    z: curveStartZ + curveRadius * Math.sin(theta),
    yaw: -theta,
  };
}

/**
 * Twin steel rails with sleepers supporting a straight entry seamlessly into a curved arc.
 * Rail head top sits at world Y = 0.22 to match WheelsetOnRail contact geometry.
 */
export const CurvedRail: React.FC<CurvedRailProps> = ({
  startZ = -10,
  curveStartZ = 2,
  curveRadius = 10,
  curveLength = 14,
  gauge = 1.435,
  highlighted = true,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const halfGauge = gauge / 2;
  const endS = curveStartZ + curveLength;

  const { leftGeo, rightGeo, sleepers } = useMemo(() => {
    const leftPts: THREE.Vector3[] = [];
    const rightPts: THREE.Vector3[] = [];
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const s = startZ + ((endS - startZ) * i) / steps;
      const f = sampleTrack(s, curveStartZ, curveRadius);
      const nx = Math.cos(f.yaw);
      const nz = -Math.sin(f.yaw);
      leftPts.push(new THREE.Vector3(f.x - nx * halfGauge, 0.19, f.z - nz * halfGauge));
      rightPts.push(new THREE.Vector3(f.x + nx * halfGauge, 0.19, f.z + nz * halfGauge));
    }
    const lCurve = new THREE.CatmullRomCurve3(leftPts);
    const rCurve = new THREE.CatmullRomCurve3(rightPts);
    const lGeo = new THREE.TubeGeometry(lCurve, 64, 0.032, 8, false);
    const rGeo = new THREE.TubeGeometry(rCurve, 64, 0.032, 8, false);

    const sleeperList: TrackFrame[] = [];
    for (let s = startZ; s <= endS; s += 0.75) {
      sleeperList.push(sampleTrack(s, curveStartZ, curveRadius));
    }
    return { leftGeo: lGeo, rightGeo: rGeo, sleepers: sleeperList };
  }, [startZ, endS, curveStartZ, curveRadius, halfGauge]);

  const railColor = highlighted ? tokens.colors.accent : tokens.colors.primary;

  return (
    <group>
      <mesh geometry={leftGeo}>
        <meshStandardMaterial
          color={railColor}
          emissive={railColor}
          emissiveIntensity={0.35}
          metalness={0.8}
          roughness={0.25}
        />
      </mesh>
      <mesh geometry={rightGeo}>
        <meshStandardMaterial
          color={railColor}
          emissive={railColor}
          emissiveIntensity={0.35}
          metalness={0.8}
          roughness={0.25}
        />
      </mesh>
      {sleepers.map((sl, idx) => (
        <mesh key={idx} position={[sl.x, 0.08, sl.z]} rotation={[0, sl.yaw, 0]}>
          <boxGeometry args={[gauge + 0.75, 0.08, 0.22]} />
          <meshStandardMaterial color={tokens.colors.gridSecondary} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
};
