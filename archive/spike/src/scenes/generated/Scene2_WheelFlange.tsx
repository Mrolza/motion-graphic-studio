import React from 'react';
import {
  BlueprintStage,
  CameraRig,
  CaptionBar,
  Callout,
  Ground,
  Rail,
  Axle,
  TitleCard,
} from '@kit';

export const Scene2_WheelFlange: React.FC = () => {
  return (
    <BlueprintStage
      cameraPosition={[2.6, 1.8, 3.2]}
      hud={
        <>
          <TitleCard
            tag="BLUEPRINT // 02"
            title="Flens Pengaman Roda"
            position="top"
            startSec={0}
            durationSec={7}
          />
          <Callout
            title="FLENS DALAM"
            body="Bibir roda di sisi dalam rel menahan posisi agar tidak keluar jalur."
            targetX={350}
            targetY={670}
            boxX={480}
            boxY={470}
            startSec={0.8}
            durationSec={5.8}
          />
          <CaptionBar
            text="Setiap roda punya flens di sisi dalam yang mengunci posisi terhadap kepala rel."
            startSec={0.2}
            durationSec={6.6}
          />
        </>
      }
    >
      <CameraRig
        mode="closeUp"
        from={[2.6, 1.8, 3.2]}
        to={[1.5, 1.15, 1.9]}
        target={[-0.55, 0.63, 0]}
        startSec={0}
        durationSec={7}
      />
      <Ground size={30} divisions={30} y={0} />
      <Rail length={16} position={[0, 0, 0]} highlighted={true} startSec={0} durationSec={7} />
      <Axle
        gauge={1.435}
        wheelRadius={0.45}
        position={[0, 0.63, 0]}
        spinRps={1.4}
        highlightFlange={true}
        startSec={0}
        durationSec={7}
      />
    </BlueprintStage>
  );
};
