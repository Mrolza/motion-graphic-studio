import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import {
  TelemetryBridge,
  TelemetryEmitter,
  TelemetryProvider,
  useTelemetry,
} from './telemetry/TelemetryContext';
import { getThemeTokens, type PaletteId } from './tokens/index';

export interface BlueprintStageProps {
  children: React.ReactNode;
  hud?: React.ReactNode;
  cameraPosition?: [number, number, number];
  fov?: number;
  palette?: PaletteId;
  telemetry?: boolean;
}

const StageCanvasInner: React.FC<{
  children: React.ReactNode;
  palette: PaletteId;
}> = ({ children, palette }) => {
  const tokens = getThemeTokens(palette);
  return (
    <>
      <color attach="background" args={[tokens.colors.bg]} />
      <fog attach="fog" args={[tokens.colors.bg, 14, 48]} />
      <ambientLight intensity={0.65} color="#b8dcff" />
      <directionalLight position={[8, 12, 6]} intensity={1.35} color="#ffffff" />
      <directionalLight position={[-6, 4, -8]} intensity={0.55} color={tokens.colors.primary} />
      <pointLight position={[0, 4, 3]} intensity={0.4} color={tokens.colors.accent} />
      {children}
    </>
  );
};

const BridgedThreeCanvas: React.FC<{
  width: number;
  height: number;
  frame: number;
  fps: number;
  cameraPosition: [number, number, number];
  fov: number;
  palette: PaletteId;
  children: React.ReactNode;
}> = ({ width, height, frame, fps, cameraPosition, fov, palette, children }) => {
  const collector = useTelemetry();
  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ position: cameraPosition, fov, near: 0.1, far: 150 }}
      style={{ width: '100%', height: '100%' }}
    >
      <TelemetryBridge collector={collector}>
        <StageCanvasInner palette={palette}>{children}</StageCanvasInner>
        {collector.enabled ? <TelemetryEmitter frame={frame} fps={fps} /> : null}
      </TelemetryBridge>
    </ThreeCanvas>
  );
};

export const BlueprintStage: React.FC<BlueprintStageProps> = ({
  children,
  hud,
  cameraPosition = [5, 3, 7],
  fov = 42,
  palette = 'blueprint-navy',
  telemetry = false,
}) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const tokens = getThemeTokens(palette);
  const existingTelemetry = useTelemetry();

  const content = (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.colors.bg,
        fontFamily: tokens.fonts.sans,
      }}
    >
      <BridgedThreeCanvas
        width={width}
        height={height}
        frame={frame}
        fps={fps}
        cameraPosition={cameraPosition}
        fov={fov}
        palette={palette}
      >
        {children}
      </BridgedThreeCanvas>
      {hud ? <AbsoluteFill style={{ pointerEvents: 'none' }}>{hud}</AbsoluteFill> : null}
    </AbsoluteFill>
  );

  if (existingTelemetry.enabled || !telemetry) {
    return content;
  }

  return <TelemetryProvider enabled={telemetry}>{content}</TelemetryProvider>;
};
