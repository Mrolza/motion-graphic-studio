import React from 'react';
import { Series } from 'remotion';
import { Scene_S1 } from './S1';
import { Scene_S2 } from './S2';
import { Scene_S3 } from './S3';
import { Scene_S4 } from './S4';
import { Scene_S5 } from './S5';

export const AssembledVideo: React.FC<{ telemetry?: boolean }> = ({ telemetry = false }) => (
  <Series>
      <Series.Sequence durationInFrames={143}>
        <Scene_S1 telemetry={telemetry} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={310}>
        <Scene_S2 telemetry={telemetry} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={281}>
        <Scene_S3 telemetry={telemetry} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={291}>
        <Scene_S4 telemetry={telemetry} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={135}>
        <Scene_S5 telemetry={telemetry} />
      </Series.Sequence>
  </Series>
);
