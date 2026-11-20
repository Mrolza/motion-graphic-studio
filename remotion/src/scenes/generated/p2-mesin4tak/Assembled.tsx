import React from 'react';
import { Series } from 'remotion';
import { Scene_S1 } from './S1';
import { Scene_S2 } from './S2';
import { Scene_S3 } from './S3';
import { Scene_S4 } from './S4';

export const AssembledVideo: React.FC<{ telemetry?: boolean }> = ({ telemetry = false }) => (
  <Series>
      <Series.Sequence durationInFrames={263}>
        <Scene_S1 telemetry={telemetry} hudData={[{"hud_id":"S1_H1","component":"KineticTitle","props":{"title":"Siklus 4 Tak"},"claim_ref":"C1"},{"hud_id":"S1_H2","component":"StatCounter","props":{"label":"Poros Engkol","unit":"°","bind_to_driver":true},"claim_ref":"C6"}]} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={382}>
        <Scene_S2 telemetry={telemetry} hudData={[{"hud_id":"S2_H1","component":"Callout","props":{"text":"Langkah Hisap","position":[0,1.5,0]},"claim_ref":"C2","when":{"driver_between":[0,180]}},{"hud_id":"S2_H2","component":"Callout","props":{"text":"Langkah Kompresi","position":[0,1.5,0]},"claim_ref":"C3","when":{"driver_between":[180,360]}}]} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={337}>
        <Scene_S3 telemetry={telemetry} hudData={[{"hud_id":"S3_H1","component":"Callout","props":{"text":"Langkah Tenaga","position":[0,1.5,0]},"claim_ref":"C9","when":{"driver_between":[360,540]}},{"hud_id":"S3_H2","component":"Callout","props":{"text":"Langkah Buang","position":[0,1.5,0]},"claim_ref":"C5","when":{"driver_between":[540,720]}}]} />
      </Series.Sequence>
      <Series.Sequence durationInFrames={147}>
        <Scene_S4 telemetry={telemetry} hudData={[{"hud_id":"S4_H1","component":"MeasureReveal","props":{"label":"Tenaga Mekanis","valueText":"Kontinu"},"claim_ref":"C4"}]} />
      </Series.Sequence>
  </Series>
);
