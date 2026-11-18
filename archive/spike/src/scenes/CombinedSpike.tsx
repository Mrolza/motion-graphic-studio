import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { Scene1_TrainDrive } from './generated/Scene1_TrainDrive';
import { Scene2_WheelFlange } from './generated/Scene2_WheelFlange';
import { Scene3_RailGauge } from './generated/Scene3_RailGauge';
import { Scene4_Suspension } from './generated/Scene4_Suspension';

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

export const CombinedSpike: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#071426' }}>
      <Sequence from={0} durationInFrames={180}>
        <FadeWrapper durationInFrames={180} fadeIn={false} fadeOut={true}>
          <Scene1_TrainDrive />
        </FadeWrapper>
      </Sequence>
      <Sequence from={172} durationInFrames={210}>
        <FadeWrapper durationInFrames={210} fadeIn={true} fadeOut={true}>
          <Scene2_WheelFlange />
        </FadeWrapper>
      </Sequence>
      <Sequence from={374} durationInFrames={180}>
        <FadeWrapper durationInFrames={180} fadeIn={true} fadeOut={true}>
          <Scene3_RailGauge />
        </FadeWrapper>
      </Sequence>
      <Sequence from={546} durationInFrames={180}>
        <FadeWrapper durationInFrames={180} fadeIn={true} fadeOut={false}>
          <Scene4_Suspension />
        </FadeWrapper>
      </Sequence>
    </AbsoluteFill>
  );
};
