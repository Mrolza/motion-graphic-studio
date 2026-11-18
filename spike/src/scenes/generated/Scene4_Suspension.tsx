import React from 'react';
import {
  BlueprintStage,
  CameraRig,
  Callout,
  CaptionBar,
  Ground,
  Rail,
  Spring,
  Axle,
  TitleCard,
} from '@kit';

export const Scene4_Suspension: React.FC = () => {
  return (
    <BlueprintStage
      cameraPosition={[3.6, 2.2, 4.2]}
      hud={
        <>
          <TitleCard
            tag="BLUEPRINT // 04"
            title="Suspensi Pegas"
            position="top"
            startSec={0}
            durationSec={6}
          />
          <Callout
            title="PEGAS KOIL"
            body="Meredam hentakan vertikal agar roda tetap menapak di rel."
            targetX={430}
            targetY={590}
            boxX={220}
            boxY={420}
            startSec={0.8}
            durationSec={4.8}
          />
          <CaptionBar
            text="Pegas suspensi menyerap getaran sehingga kontak roda dan rel selalu terjaga."
            startSec={0.2}
            durationSec={5.6}
          />
        </>
      }
    >
      <CameraRig
        mode="dolly"
        from={[3.6, 2.2, 4.2]}
        to={[2.2, 1.7, 2.8]}
        target={[0, 1.1, 0]}
        startSec={0}
        durationSec={6}
      />
      <Ground size={30} divisions={30} />
      <Rail length={18} startSec={0} durationSec={6} />
      <Axle
        position={[0, 0.63, 0]}
        spinRps={1.5}
        gauge={1.435}
        wheelRadius={0.45}
        startSec={0}
        durationSec={6}
      />
      <Spring
        position={[-0.72, 1.45, 0]}
        radius={0.26}
        height={0.9}
        turns={5}
        amplitude={0.25}
        freqHz={2.0}
        highlighted={true}
        startSec={0}
        durationSec={6}
      />
      <Spring
        position={[0.72, 1.45, 0]}
        radius={0.26}
        height={0.9}
        turns={5}
        amplitude={0.25}
        freqHz={2.0}
        highlighted={true}
        startSec={0}
        durationSec={6}
      />
    </BlueprintStage>
  );
};
