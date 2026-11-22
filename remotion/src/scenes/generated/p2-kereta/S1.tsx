import React from 'react';
import {
  StoryboardHudProvider,
  TelemetryProvider,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  HudLayout,
  HudZone,
  Hud,
  useDriver,
  computeWheelsetLayout,
  TrainCar,
  CurvedRail,
  Ground
} from '../../../kit';

export interface Scene_S1Props {
  telemetry?: boolean;
  hudData?: any[];
}

const Scene_S1Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'distance',
    from: 0,
    to: 10,
    unit: 'm',
    startSec: 3.36,
    durationSec: 0.8,
    curve: 'linear'
  });

  const distM = -2 + driver.progress * 5;
  const curveRadius = 16;
  const curveStartZ = 2;
  const wl = computeWheelsetLayout({
    distance: driver.value,
    curveStartZ,
    curveRadius
  });

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage
        palette="blueprint-navy"
        telemetry={telemetry}
        hud={
          <HudLayout palette="blueprint-navy">
            <HudZone zone="title" palette="blueprint-navy">
              <Hud id="S1_H1" driver={driver} palette="blueprint-navy" />
            </HudZone>
          </HudLayout>
        }
      >
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: wl.center, size: [2.2, 2.0, 4.4] }}
          padding={0.7}
          startAngleDeg={-20}
          endAngleDeg={20}
        />
        <CurvedRail
          startZ={-10}
          curveStartZ={curveStartZ}
          curveRadius={curveRadius}
          curveLength={18}
          gauge={1.435}
          highlighted
          palette="blueprint-navy"
        />
        <Ground size={60} divisions={60} y={0} />
        <TrainCar
          entityId="train_car"
          distance={distM}
          curveStartZ={curveStartZ}
          curveRadius={curveRadius}
          palette="blueprint-navy"
        />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const Scene_S1: React.FC<Scene_S1Props> = ({
  telemetry = false,
  hudData = []
}) => (
  <TelemetryProvider enabled={telemetry}>
    <StoryboardHudProvider items={hudData}>
      <Scene_S1Inner telemetry={telemetry} />
    </StoryboardHudProvider>
  </TelemetryProvider>
);