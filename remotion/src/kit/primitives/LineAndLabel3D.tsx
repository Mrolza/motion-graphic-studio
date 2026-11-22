import React, { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useTelemetry } from '../telemetry/TelemetryContext';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface Line3DProps {
  from: [number, number, number];
  to: [number, number, number];
  radius?: number;
  color?: string;
  palette?: PaletteId;
}

/**
 * 3D cylindrical line segment between two world coordinates.
 */
export const Line3D: React.FC<Line3DProps> = ({
  from,
  to,
  radius = 0.015,
  color,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = Math.max(0.001, dir.length());
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  const euler = new THREE.Euler().setFromQuaternion(quat);

  return (
    <mesh position={[mid.x, mid.y, mid.z]} rotation={[euler.x, euler.y, euler.z]}>
      <cylinderGeometry args={[radius, radius, len, 10]} />
      <meshStandardMaterial
        color={color ?? tokens.colors.primary}
        emissive={color ?? tokens.colors.primary}
        emissiveIntensity={0.45}
      />
    </mesh>
  );
};

export interface Arrow3DProps extends Line3DProps {
  headRadius?: number;
  headLength?: number;
  telemetryId?: string;
  skipTelemetry?: boolean;
}

/**
 * 3D directional vector arrow from `from` to `to`.
 */
export const Arrow3D: React.FC<Arrow3DProps> = ({
  from,
  to,
  radius = 0.02,
  headRadius = 0.07,
  headLength = 0.18,
  color,
  palette = 'blueprint-navy',
  telemetryId = 'arrow3d_unbound',
  skipTelemetry = false,
}) => {
  const tokens = getThemeTokens(palette);
  const telemetry = useTelemetry();
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const dir = new THREE.Vector3().subVectors(end, start);
  const totalLen = Math.max(headLength + 0.02, dir.length());
  const unit = dir.clone().normalize();
  const shaftEnd = start.clone().addScaledVector(unit, totalLen - headLength);
  const headPos = start.clone().addScaledVector(unit, totalLen - headLength * 0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit);
  const euler = new THREE.Euler().setFromQuaternion(quat);
  const c = color ?? tokens.colors.accent;

  useLayoutEffect(() => {
    if (!skipTelemetry && telemetry.enabled) {
      telemetry.reportEntity({
        id: telemetryId,
        role: 'prop',
        partStates: {
          arrow_dir_x: Number(unit.x.toFixed(3)),
          arrow_dir_y: Number(unit.y.toFixed(3)),
          arrow_dir_z: Number(unit.z.toFixed(3)),
          bind_to_part: 'unbound',
          arrow_bound: false,
        },
      });
    }
  });

  return (
    <group>
      <Line3D from={from} to={[shaftEnd.x, shaftEnd.y, shaftEnd.z]} radius={radius} color={c} palette={palette} />
      <mesh position={[headPos.x, headPos.y, headPos.z]} rotation={[euler.x, euler.y, euler.z]}>
        <coneGeometry args={[headRadius, headLength, 14]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.55} />
      </mesh>
    </group>
  );
};

export interface Label3DProps {
  position: [number, number, number];
  width?: number;
  height?: number;
  color?: string;
  palette?: PaletteId;
}

/**
 * 3D marker plate used as an anchor/callout target in world space.
 */
export const Label3D: React.FC<Label3DProps> = ({
  position,
  width = 0.36,
  height = 0.14,
  color,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const c = color ?? tokens.colors.accent;
  return (
    <mesh position={position}>
      <boxGeometry args={[width, height, 0.02]} />
      <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.5} />
    </mesh>
  );
};
