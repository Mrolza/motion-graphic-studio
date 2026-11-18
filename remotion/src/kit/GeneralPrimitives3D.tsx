import React from 'react';
import { BLUEPRINT_TOKENS } from './tokens';

export interface BasePrimitiveProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  /** Semi-transparent cutaway / X-ray mode so internal parts remain visible. */
  cutaway?: boolean;
  opacity?: number;
  wireframe?: boolean;
  startSec?: number;
  durationSec?: number;
}

function Material({
  color = BLUEPRINT_TOKENS.colors.steelLight,
  emissive = '#000000',
  emissiveIntensity = 0,
  metalness = 0.5,
  roughness = 0.4,
  cutaway = false,
  opacity,
  wireframe = false,
}: BasePrimitiveProps) {
  const finalOpacity = opacity ?? (cutaway ? 0.26 : 1);
  const isTransparent = cutaway || finalOpacity < 1;
  return (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      metalness={metalness}
      roughness={roughness}
      transparent={isTransparent}
      opacity={finalOpacity}
      depthWrite={!isTransparent}
      wireframe={wireframe}
    />
  );
}

export interface GroupProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  children?: React.ReactNode;
}

export const Group: React.FC<GroupProps> = ({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  children,
}) => (
  <group position={position} rotation={rotation} scale={scale}>
    {children}
  </group>
);

export interface GridProps {
  size?: number;
  divisions?: number;
  position?: [number, number, number];
  colorCenterLine?: string;
  colorGrid?: string;
}

export const Grid: React.FC<GridProps> = ({
  size = 40,
  divisions = 40,
  position = [0, 0, 0],
  colorCenterLine = BLUEPRINT_TOKENS.colors.cyan,
  colorGrid = BLUEPRINT_TOKENS.colors.gridSecondary,
}) => (
  <gridHelper args={[size, divisions, colorCenterLine, colorGrid]} position={position} />
);

export interface BoxProps extends BasePrimitiveProps {
  size?: [number, number, number];
}

export const Box: React.FC<BoxProps> = ({
  size = [1, 1, 1],
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  ...mat
}) => (
  <mesh position={position} rotation={rotation} scale={scale}>
    <boxGeometry args={size} />
    <Material {...mat} />
  </mesh>
);

export interface CylinderProps extends BasePrimitiveProps {
  radiusTop?: number;
  radiusBottom?: number;
  height?: number;
  radialSegments?: number;
  openEnded?: boolean;
  thetaStart?: number;
  thetaLength?: number;
}

export const Cylinder: React.FC<CylinderProps> = ({
  radiusTop = 0.5,
  radiusBottom = 0.5,
  height = 1,
  radialSegments = 24,
  openEnded = false,
  thetaStart = 0,
  thetaLength = Math.PI * 2,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  ...mat
}) => (
  <mesh position={position} rotation={rotation} scale={scale}>
    <cylinderGeometry
      args={[radiusTop, radiusBottom, height, radialSegments, 1, openEnded, thetaStart, thetaLength]}
    />
    <Material {...mat} />
  </mesh>
);

export interface SphereProps extends BasePrimitiveProps {
  radius?: number;
  widthSegments?: number;
  heightSegments?: number;
}

export const Sphere: React.FC<SphereProps> = ({
  radius = 0.5,
  widthSegments = 20,
  heightSegments = 16,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  ...mat
}) => (
  <mesh position={position} rotation={rotation} scale={scale}>
    <sphereGeometry args={[radius, widthSegments, heightSegments]} />
    <Material {...mat} />
  </mesh>
);

export interface TorusProps extends BasePrimitiveProps {
  radius?: number;
  tube?: number;
  radialSegments?: number;
  tubularSegments?: number;
  arc?: number;
}

export const Torus: React.FC<TorusProps> = ({
  radius = 0.5,
  tube = 0.12,
  radialSegments = 12,
  tubularSegments = 28,
  arc = Math.PI * 2,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  ...mat
}) => (
  <mesh position={position} rotation={rotation} scale={scale}>
    <torusGeometry args={[radius, tube, radialSegments, tubularSegments, arc]} />
    <Material {...mat} />
  </mesh>
);

export interface ConeProps extends BasePrimitiveProps {
  radius?: number;
  height?: number;
  radialSegments?: number;
  openEnded?: boolean;
  thetaStart?: number;
  thetaLength?: number;
}

export const Cone: React.FC<ConeProps> = ({
  radius = 0.5,
  height = 1,
  radialSegments = 20,
  openEnded = false,
  thetaStart = 0,
  thetaLength = Math.PI * 2,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  ...mat
}) => (
  <mesh position={position} rotation={rotation} scale={scale}>
    <coneGeometry args={[radius, height, radialSegments, 1, openEnded, thetaStart, thetaLength]} />
    <Material {...mat} />
  </mesh>
);
