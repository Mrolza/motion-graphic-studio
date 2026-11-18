import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { BLUEPRINT_TOKENS } from './tokens';

export interface BlueprintStageProps {
  children: React.ReactNode;
  hud?: React.ReactNode;
  cameraPosition?: [number, number, number];
  fov?: number;
}

export const BlueprintStage: React.FC<BlueprintStageProps> = ({
  children,
  hud,
  cameraPosition = [5, 3, 7],
  fov = 42,
}) => {
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BLUEPRINT_TOKENS.colors.bg,
        fontFamily: BLUEPRINT_TOKENS.fonts.sans,
      }}
    >
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: cameraPosition, fov, near: 0.1, far: 150 }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={[BLUEPRINT_TOKENS.colors.bg]} />
        <fog attach="fog" args={[BLUEPRINT_TOKENS.colors.bg, 14, 48]} />
        <ambientLight intensity={0.65} color="#b8dcff" />
        <directionalLight position={[8, 12, 6]} intensity={1.35} color="#ffffff" />
        <directionalLight position={[-6, 4, -8]} intensity={0.55} color={BLUEPRINT_TOKENS.colors.cyan} />
        <pointLight position={[0, 4, 3]} intensity={0.4} color={BLUEPRINT_TOKENS.colors.yellow} />
        {children}
      </ThreeCanvas>
      {hud ? (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>{hud}</AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
