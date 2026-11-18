import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { Scene1_EngineCutaway } from './generated-p0b/Scene1_EngineCutaway';
import { Scene2_IntakeCompression } from './generated-p0b/Scene2_IntakeCompression';
import { Scene3_PowerExhaust } from './generated-p0b/Scene3_PowerExhaust';
import { Scene4_CycleSummary } from './generated-p0b/Scene4_CycleSummary';

const FadeWrapper: React.FC<{
  children: React.ReactNode;
  durationInFrames: number;
  fadeIn: boolean;
  fadeOut: boolean;
}> = ({ children, durationInFrames, fadeIn, fadeOut }) => {
  const frame = useCurrentFrame();
  const inOpacity = fadeIn ? interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' }) : 1;
  const outOpacity = fadeOut
    ? interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' })
    : 1;
  return <AbsoluteFill style={{ opacity: Math.min(inOpacity, outOpacity) }}>{children}</AbsoluteFill>;
};

export const CombinedSpikeP0b: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#071426' }}>
      <Sequence from={0} durationInFrames={180}>
        <FadeWrapper durationInFrames={180} fadeIn={false} fadeOut={true}>
          <Scene1_EngineCutaway />
        </FadeWrapper>
      </Sequence>
      <Sequence from={172} durationInFrames={180}>
        <FadeWrapper durationInFrames={180} fadeIn={true} fadeOut={true}>
          <Scene2_IntakeCompression />
        </FadeWrapper>
      </Sequence>
      <Sequence from={344} durationInFrames={210}>
        <FadeWrapper durationInFrames={210} fadeIn={true} fadeOut={true}>
          <Scene3_PowerExhaust />
        </FadeWrapper>
      </Sequence>
      <Sequence from={546} durationInFrames={180}>
        <FadeWrapper durationInFrames={180} fadeIn={true} fadeOut={false}>
          <Scene4_CycleSummary />
        </FadeWrapper>
      </Sequence>
    </AbsoluteFill>
  );
};
