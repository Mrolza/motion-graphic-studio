import React, { useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { projectBox3ToScreen } from './projection';
import { useTelemetry } from './TelemetryContext';

export interface TelemetryEntityProps {
  /** Unique entity identifier (e.g. "wheelset", "piston_crank"). */
  id: string;
  /** Role in scene framing QC. Focus entities must stay inside 9:16 safe bounds. */
  role?: 'focus' | 'prop';
  /** Current mechanical/visual part states reported per frame. */
  partStates?: Record<string, string | number | boolean>;
  children: React.ReactNode;
}

/**
 * Wraps a 3D assembly or focus object and reports its projected 2D screen bounding box
 * and part states when telemetry mode is enabled.
 */
export const TelemetryEntity: React.FC<TelemetryEntityProps> = ({
  id,
  role = 'focus',
  partStates,
  children,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const telemetry = useTelemetry();
  const { camera, size } = useThree();

  useLayoutEffect(() => {
    if (!telemetry.enabled || !groupRef.current) return;
    groupRef.current.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(groupRef.current);
    const bbox = projectBox3ToScreen(box, camera, size.width, size.height);
    telemetry.reportEntity({ id, role, bbox, partStates });
  });

  return <group ref={groupRef}>{children}</group>;
};
