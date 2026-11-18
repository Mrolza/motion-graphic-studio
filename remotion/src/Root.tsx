import React from 'react';
import { Composition } from 'remotion';
import { BLUEPRINT_TOKENS } from './kit';
import { KitSample } from './scenes/KitSample';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="KitSample"
      component={KitSample}
      durationInFrames={90}
      fps={BLUEPRINT_TOKENS.viewport.fps}
      width={BLUEPRINT_TOKENS.viewport.width}
      height={BLUEPRINT_TOKENS.viewport.height}
    />
  );
};
