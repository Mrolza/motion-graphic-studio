import React, { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EasingMode, getLocalProgress, useSceneTime } from './motion';

export type CameraMode = 'dolly' | 'orbit' | 'closeUp' | 'frameEntities';
export type FramingPreset = 'default' | 'portrait-lower' | 'portrait-center' | 'portrait-closeup';

const FRAMING_Y_OFFSET: Record<FramingPreset, number> = {
  default: 0,
  'portrait-center': 0,
  'portrait-lower': -0.25,
  'portrait-closeup': -0.15,
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
      const safePad = Math.max(1.24, padding);
      const aspect = size.width / Math.max(1, size.height);
      const vFovRad = (fov * Math.PI) / 180;
      const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
      const halfW = focusBox.size[0] * 0.5 * safePad;
      const halfH = focusBox.size[1] * 0.5 * safePad;
      const halfD = focusBox.size[2] * 0.5 * safePad;
      const azimRad = ((startAngleDeg + (endAngleDeg - startAngleDeg) * p) * Math.PI) / 180;
      const elevRad = (elevationDeg * Math.PI) / 180;

      // Project bounding box half-extents onto camera view axes for 9:16 portrait safety
      const projHalfW = halfW * Math.abs(Math.cos(azimRad)) + halfD * Math.abs(Math.sin(azimRad));
      const safeProjHalfW = Math.max(projHalfW, Math.hypot(halfW, halfD) * 0.72);
      const projFrontD = halfW * Math.abs(Math.sin(azimRad)) + halfD * Math.abs(Math.cos(azimRad));
      const freeZoneHeightRatio = 0.41;
      const distV = halfH / (Math.tan(vFovRad / 2) * freeZoneHeightRatio) + projFrontD;
      const distH = safeProjHalfW / (Math.tan(hFovRad / 2) * 0.94) + projFrontD;
      const dist = Math.max(distV, distH);

      // Shift lookAt slightly DOWN so the 3D subject projects into the upper-middle free zone (y ~ 240..780)
      const freeZoneCenterShift = -dist * Math.tan(vFovRad / 2) * 0.12;
      const aimY = focusBox.center[1] + freeZoneCenterShift;
      camera.position.set(
        focusBox.center[0] + Math.sin(azimRad) * Math.cos(elevRad) * dist,
        aimY + Math.sin(elevRad) * dist,
        focusBox.center[2] + Math.cos(azimRad) * Math.cos(elevRad) * dist
      );
      camera.lookAt(focusBox.center[0], aimY, focusBox.center[2]);
      camera.updateMatrixWorld();
      return;
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
