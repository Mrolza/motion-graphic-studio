import React from 'react';
import { Composition } from 'remotion';
import { BenchmarkScene } from './scenes/BenchmarkScene';
import { CombinedSpike } from './scenes/CombinedSpike';
import { BLUEPRINT_TOKENS } from './kit';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BenchmarkScene"
        component={BenchmarkScene}
        durationInFrames={180}
        fps={BLUEPRINT_TOKENS.viewport.fps}
        width={BLUEPRINT_TOKENS.viewport.width}
        height={BLUEPRINT_TOKENS.viewport.height}
      />
      <Composition
        id="CombinedSpike"
        component={CombinedSpike}
        durationInFrames={726}
        fps={BLUEPRINT_TOKENS.viewport.fps}
        width={BLUEPRINT_TOKENS.viewport.width}
        height={BLUEPRINT_TOKENS.viewport.height}
      />
    </>
  );
};
