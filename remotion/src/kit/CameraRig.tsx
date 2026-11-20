import React, { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EasingMode, getLocalProgress, useSceneTime } from './motion';

export type CameraMode = 'dolly' | 'orbit' | 'closeUp' | 'frameEntities';
export type FramingPreset = 'default' | 'portrait-lower' | 'portrait-center' | 'portrait-closeup';

const FRAMING_Y_OFFSET: Record<FramingPreset, number> = {
  default: 0,
  'portrait-center': 0.1,
  'portrait-lower': 0.35,
  'portrait-closeup': 0.2,
};

export interface FocusBox {
  center: [number, number, number];
  size: [number, number, number];
}

export interface CameraRigProps {
  mode: CameraMode;
  framing?: FramingPreset;
  startSec?: number;
  durationSec?: number;
  easing?: EasingMode;
  from?: [number, number, number];
  to?: [number, number, number];
  target?: [number, number, number];
  targetFrom?: [number, number, number];
  targetTo?: [number, number, number];
  radius?: number;
  height?: number;
  startAngleDeg?: number;
  endAngleDeg?: number;
  fov?: number;
  /** Used in mode="frameEntities": world bounding box to keep inside 9:16 safe zone. */
  focusBox?: FocusBox;
  /** Padding multiplier for frameEntities (>= 1.0). Defaults to 1.45. */
  padding?: number;
  /** Elevation angle in degrees for frameEntities. Defaults to 18. */
  elevationDeg?: number;
}

export const CameraRig: React.FC<CameraRigProps> = ({
  mode,
  framing = 'portrait-lower',
  startSec = 0,
  durationSec = 5,
  easing = 'easeInOut',
  from = [6, 3.5, 8],
  to = [3, 2.5, 4],
  target = [0, 0.8, 0],
  targetFrom,
  targetTo,
  radius = 6,
  height = 3,
  startAngleDeg = -35,
  endAngleDeg = 45,
  fov = 42,
  focusBox,
  padding = 1.45,
  elevationDeg = 18,
}) => {
  const { camera, size } = useThree();
  const { sec } = useSceneTime();
  const p = getLocalProgress(sec, startSec, durationSec, easing);

  const applyCamera = () => {
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    const lookFrom = focusBox ? focusBox.center : (targetFrom ?? target);
    const lookTo = focusBox ? focusBox.center : (targetTo ?? target);
    const framingY = FRAMING_Y_OFFSET[framing];
    const lookX = lookFrom[0] + (lookTo[0] - lookFrom[0]) * p;
    const lookY = lookFrom[1] + (lookTo[1] - lookFrom[1]) * p + framingY;
    const lookZ = lookFrom[2] + (lookTo[2] - lookFrom[2]) * p;

    if (mode === 'frameEntities' && focusBox) {
      const aspect = size.width / Math.max(1, size.height);
      const vFovRad = (fov * Math.PI) / 180;
      const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
      const halfW = (focusBox.size[0] * 0.5) * padding;
      const halfH = (focusBox.size[1] * 0.5) * padding;
      const halfD = (focusBox.size[2] * 0.5) * padding;
      const maxHoriz = Math.max(halfW, halfD);
      const distV = halfH / Math.tan(vFovRad / 2);
      const distH = maxHoriz / Math.tan(hFovRad / 2);
      const dist = Math.max(distV, distH) + halfD;
      const azimRad = ((startAngleDeg + (endAngleDeg - startAngleDeg) * p) * Math.PI) / 180;
      const elevRad = (elevationDeg * Math.PI) / 180;
      camera.position.set(
        lookX + Math.sin(azimRad) * Math.cos(elevRad) * dist,
        lookY + Math.sin(elevRad) * dist,
        lookZ + Math.cos(azimRad) * Math.cos(elevRad) * dist
      );
    } else if (mode === 'orbit') {
      const angleDeg = startAngleDeg + (endAngleDeg - startAngleDeg) * p;
      const rad = (angleDeg * Math.PI) / 180;
      camera.position.set(
        lookX + Math.sin(rad) * radius,
        lookY + height,
        lookZ + Math.cos(rad) * radius
      );
    } else {
      // dolly or closeUp
      camera.position.set(
        from[0] + (to[0] - from[0]) * p,
        from[1] + (to[1] - from[1]) * p,
        from[2] + (to[2] - from[2]) * p
      );
    }

    camera.lookAt(lookX, lookY, lookZ);
    camera.updateMatrixWorld();
  };

  // Apply synchronously before ThreeCanvas draws the frame, and in useLayoutEffect as backup
  applyCamera();
  useLayoutEffect(applyCamera);

  return null;
};
