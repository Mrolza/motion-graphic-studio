import React from 'react';
import {
  BlueprintStage,
  CameraRig,
  CaptionBar,
  DimensionLine,
  Ground,
  Rail,
  StatCounter,
  TitleCard,
  Axle,
} from '@kit';

export const Scene3_RailGauge: React.FC = () => {
  return (
    <BlueprintStage
      cameraPosition={[0, 2.8, 4.2]}
      hud={
        <>
          <TitleCard
            tag="BLUEPRINT // 03"
            title="Presisi Lebar Rel"
            position="top"
            startSec={0}
            durationSec={6}
          />
          <StatCounter
            label="Standard Gauge"
            from={1249}
            to={1435}
            unit="mm"
            decimals={0}
            position="top-right"
            startSec={0.5}
            durationSec={4}
          />
          <DimensionLine
            label="1.435 mm"
            x1={200}
            y1={740}
            x2={520}
            y2={740}
            startSec={0.5}
            durationSec={5}
          />
          <CaptionBar
            text="Lebar rel standar 1.435 mm dijaga presisi sepanjang jalur."
            startSec={0.2}
            durationSec={5.6}
          />
        </>
      }
    >
      <CameraRig
        mode="orbit"
        target={[0, 0.4, 0]}
        radius={4.2}
        height={2.8}
        startAngleDeg={-25}
        endAngleDeg={25}
        startSec={0}
        durationSec={6}
      />
      <Ground size={30} divisions={30} y={0} />
      <Rail
        length={22}
        gauge={1.435}
        position={[0, 0, 0]}
        highlighted={true}
        startSec={0}
        durationSec={6}
      />
      <Axle
        gauge={1.435}
        wheelRadius={0.45}
        position={[0, 0.63, -1.2]}
        spinRps={0.8}
        highlightFlange={true}
        startSec={0}
        durationSec={6}
      />
    </BlueprintStage>
  );
};
