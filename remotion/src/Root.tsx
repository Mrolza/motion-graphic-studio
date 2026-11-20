import React from 'react';
import { Composition } from 'remotion';
import { BLUEPRINT_TOKENS } from './kit';
import { DemoKereta } from './scenes/DemoKereta';
import { DemoMesin } from './scenes/DemoMesin';
import { KitSample } from './scenes/KitSample';
import { GeneratedCompositions } from './scenes/generated/registry';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <GeneratedCompositions />
      <Composition
        id="KitSample"
        component={KitSample}
        durationInFrames={90}
        fps={BLUEPRINT_TOKENS.viewport.fps}
        width={BLUEPRINT_TOKENS.viewport.width}
        height={BLUEPRINT_TOKENS.viewport.height}
      />
      <Composition
        id="DemoKereta"
        component={DemoKereta}
        durationInFrames={450}
        fps={BLUEPRINT_TOKENS.viewport.fps}
        width={BLUEPRINT_TOKENS.viewport.width}
        height={BLUEPRINT_TOKENS.viewport.height}
        defaultProps={{ telemetry: false }}
      />
      <Composition
        id="DemoMesin"
        component={DemoMesin}
        durationInFrames={480}
        fps={BLUEPRINT_TOKENS.viewport.fps}
        width={BLUEPRINT_TOKENS.viewport.width}
        height={BLUEPRINT_TOKENS.viewport.height}
        defaultProps={{ telemetry: false }}
      />
    </>
  );
};
