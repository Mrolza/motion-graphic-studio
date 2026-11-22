import React from 'react';
import { Composition } from 'remotion';
import { Scene_S1 as Comp_0 } from './p2-kereta/S1';
import { AssembledProject as Comp_1 } from './p2-kereta/Assembled';
import { Scene_S1 as Comp_2 } from './p2-mesin4tak/S1';
import { Scene_S2 as Comp_3 } from './p2-mesin4tak/S2';
import { Scene_S3 as Comp_4 } from './p2-mesin4tak/S3';
import { Scene_S4 as Comp_5 } from './p2-mesin4tak/S4';
import { Scene_S5 as Comp_6 } from './p2-mesin4tak/S5';
import { AssembledProject as Comp_7 } from './p2-mesin4tak/Assembled';

export const GeneratedCompositions: React.FC = () => (
  <>
      <Composition id="gen-p2-kereta-S1" component={Comp_0} durationInFrames={144} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-kereta-assembled" component={Comp_1} durationInFrames={1036} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-mesin4tak-S1" component={Comp_2} durationInFrames={146} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-mesin4tak-S2" component={Comp_3} durationInFrames={192} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-mesin4tak-S3" component={Comp_4} durationInFrames={316} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-mesin4tak-S4" component={Comp_5} durationInFrames={309} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-mesin4tak-S5" component={Comp_6} durationInFrames={146} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
      <Composition id="gen-p2-mesin4tak-assembled" component={Comp_7} durationInFrames={1123} fps={30} width={720} height={1280} defaultProps={{ telemetry: false }} />
  </>
);
