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
        <Scene_S1 telemetry={telemetry} hudData={[{"hud_id":"S1_H1","component":"KineticTitle","props":{"title":"Stabilitas Rel Kereta"},"illustrative":true}]} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={310}>
        <Scene_S2 telemetry={telemetry} hudData={[{"hud_id":"S2_H1","component":"MeasureReveal","props":{"label":"Kemiringan Kerucut","valueText":"1 banding 20"},"claim_ref":"C1"},{"hud_id":"S2_H2","component":"Callout","props":{"text":"Mengikuti tikungan tanpa flens bergesekan"},"claim_ref":"C1"}]} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={281}>
        <Scene_S3 telemetry={telemetry} hudData={[{"hud_id":"S3_H1","component":"Callout","props":{"text":"Inersia membuat roda melaju lurus"},"claim_ref":"C2"}]} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={291}>
        <Scene_S4 telemetry={telemetry} hudData={[{"hud_id":"S4_H1","component":"StatCounter","props":{"label":"Diameter Efektif","bind_to_driver":true},"claim_ref":"C3"}]} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={135}>
        <Scene_S5 telemetry={telemetry} hudData={[{"hud_id":"S5_H1","component":"KineticTitle","props":{"title":"Kurva Jalur Efisien"},"claim_ref":"C3"}]} />
      </Series.Sequence>
  </Series>
);
