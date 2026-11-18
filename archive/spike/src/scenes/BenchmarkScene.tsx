import React from 'react';
import {
  BlueprintStage,
  CameraRig,
  CaptionBar,
  Ground,
  Pole,
  Rail,
  Spring,
  StatCounter,
  TitleCard,
  TrainCar,
} from '../kit';

export const BenchmarkScene: React.FC = () => {
  return (
    <BlueprintStage
      cameraPosition={[5.5, 3.2, 7.5]}
      hud={
        <>
          <TitleCard
            tag="SPIKE P0 // BENCHMARK"
            title="Kenapa Kereta Tidak Tergelincir?"
            subtitle="Uji Scene Kit Blueprint 3D + Kamera + HUD"
            position="top"
            startSec={0}
            durationSec={6}
          />
          <StatCounter
            label="Lebar Rel Standar"
            from={1249}
            to={1435}
            unit="mm"
            decimals={0}
            position="top-right"
            startSec={0.5}
            durationSec={2.8}
          />
          <CaptionBar
            text="Roda kereta memiliki flens di sisi dalam dan suspensi pegas untuk menjaga stabilitas."
            startSec={0.2}
            durationSec={5.6}
          />
        </>
      }
    >
      <CameraRig
        mode="orbit"
        startSec={0}
        durationSec={6}
        target={[0, 1.1, 0]}
        radius={6.8}
        height={2.6}
        startAngleDeg={-40}
        endAngleDeg={35}
      />
      <Ground size={40} divisions={40} />
      <Rail length={28} gauge={1.435} highlighted startSec={1} durationSec={4} />
      <Pole position={[2.1, 0, -4]} />
      <Pole position={[2.1, 0, 3]} />
      <TrainCar
        from={[0, 0, -5]}
        to={[0, 0, 3.5]}
        spinRps={2.2}
        startSec={0}
        durationSec={6}
      />
      <Spring position={[-1.8, 0.75, 0]} startSec={0} durationSec={6} />
    </BlueprintStage>
  );
};
