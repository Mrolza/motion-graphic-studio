import React from 'react';
import { Composition } from 'remotion';
import { Scene_S1 as Comp_0 } from './p2-kereta/S1';
import { Scene_S2 as Comp_1 } from './p2-kereta/S2';
import { Scene_S3 as Comp_2 } from './p2-kereta/S3';
import { Scene_S4 as Comp_3 } from './p2-kereta/S4';
import { Scene_S5 as Comp_4 } from './p2-kereta/S5';
import { AssembledProject as Comp_5 } from './p2-kereta/Assembled';
import { Scene_S1 as Comp_6 } from './p2-mesin4tak/S1';
import { Scene_S2 as Comp_7 } from './p2-mesin4tak/S2';
import { Scene_S3 as Comp_8 } from './p2-mesin4tak/S3';
import { Scene_S4 as Comp_9 } from './p2-mesin4tak/S4';
import { AssembledProject as Comp_10 } from './p2-mesin4tak/Assembled';

export const GeneratedCompositions: React.FC = () => (
  <>
      <Composition id="gen-p2-kereta-S1" component={Comp_0} durationInFrames={135} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-kereta-S2" component={Comp_1} durationInFrames={285} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-kereta-S3" component={Comp_2} durationInFrames={256} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-kereta-S4" component={Comp_3} durationInFrames={266} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-kereta-S5" component={Comp_4} durationInFrames={135} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-kereta-assembled" component={Comp_5} durationInFrames={1042} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-mesin4tak-S1" component={Comp_6} durationInFrames={229} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-mesin4tak-S2" component={Comp_7} durationInFrames={342} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-mesin4tak-S3" component={Comp_8} durationInFrames={302} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-mesin4tak-S4" component={Comp_9} durationInFrames={141} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-mesin4tak-assembled" component={Comp_10} durationInFrames={1025} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
  </>
);
