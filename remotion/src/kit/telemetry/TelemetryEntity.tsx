import React, { useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { projectBox3ToScreen } from './projection';
import { useTelemetry } from './TelemetryContext';
import type { ScreenBox } from './types';

export interface TelemetryEntityProps {
  /** Unique entity identifier (e.g. "wheelset", "piston_crank"). */
  id: string;
  /** Role in scene framing QC. Focus entities must stay inside 9:16 safe bounds. */
  role?: 'focus' | 'prop';
  /** Current mechanical/visual part states reported per frame. */
  partStates?: Record<string, string | number | boolean>;
  /** Named 3D sub-part refs whose projected screen bounding boxes are reported. */
  partRefs?: Record<string, React.RefObject<THREE.Object3D | null>>;
  /** Pure geometry constraint measurements reported per frame. */
  geometry?: Record<string, number | boolean>;
  children: React.ReactNode;
}

/**
 * Wraps a 3D assembly or focus object and reports its projected 2D screen bounding box,
 * sub-part bounding boxes, geometry constraints, and part states when telemetry mode is enabled.
 */
export const TelemetryEntity: React.FC<TelemetryEntityProps> = ({
  id,
  role = 'focus',
  partStates,
  partRefs,
  geometry,
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

    let parts: Record<string, ScreenBox> | undefined;
    if (partRefs) {
      parts = {};
      for (const [partId, ref] of Object.entries(partRefs)) {
        if (!ref.current) continue;
        ref.current.updateWorldMatrix(true, true);
        const pBox = new THREE.Box3().setFromObject(ref.current);
        const pScreen = projectBox3ToScreen(pBox, camera, size.width, size.height);
        if (pScreen) parts[partId] = pScreen;
      }
    }

    telemetry.reportEntity({ id, role, bbox, parts, partStates, geometry });
  });

  return <group ref={groupRef}>{children}</group>;
};
