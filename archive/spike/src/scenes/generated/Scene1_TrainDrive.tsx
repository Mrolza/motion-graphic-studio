import React from 'react';
import {
  BlueprintStage,
  CameraRig,
  CaptionBar,
  Ground,
  Pole,
  Rail,
  TitleCard,
  TrainCar,
} from '@kit';

export const Scene1_TrainDrive: React.FC = () => {
  return (
    <BlueprintStage
      cameraPosition={[6.5, 3.4, 8.5]}
      hud={
        <>
          <TitleCard
            tag="BLUEPRINT // 01"
            title="Kenapa Kereta Tidak Tergelincir?"
            subtitle="Rahasia di balik roda & rel baja"
            position="top"
            startSec={0}
            durationSec={5.8}
          />
          <CaptionBar
            text="Melaju ratusan km/jam tanpa setir—bagaimana kereta tetap di jalur?"
            startSec={0.2}
            durationSec={5.5}
          />
        </>
      }
    >
      <CameraRig
        mode="dolly"
        from={[6.5, 3.4, 8.5]}
        to={[3.8, 2.2, 4.2]}
        target={[0, 1.2, 0]}
        startSec={0}
        durationSec={6}
      />
      <Ground size={40} divisions={40} y={0} />
      <Rail length={30} gauge={1.435} position={[0, 0, 0]} highlighted={false} startSec={0} durationSec={6} />
      <Pole height={4.2} position={[2.1, 0, -4]} withArm={true} />
      <Pole height={4.2} position={[2.1, 0, 4]} withArm={true} />
      <TrainCar
        position={[0, 0, 0]}
        from={[0, 0, -7]}
        to={[0, 0, 4]}
        easing="easeInOut"
        gauge={1.435}
        spinRps={2.2}
        length={5.6}
        startSec={0}
        durationSec={6}
      />
    </BlueprintStage>
  );
};
