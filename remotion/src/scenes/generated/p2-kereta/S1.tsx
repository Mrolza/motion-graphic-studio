import React from 'react';
import {
  StoryboardHudProvider,
  TelemetryProvider,
  useDriver,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  CurvedRail,
  Ground,
  TrainCar,
  HudLayout,
  HudZone,
  Hud,
  computeWheelsetLayout
} from '../../../kit';

export interface Scene_S1Props {
  telemetry?: boolean;
  hudData?: any[];
}

const Scene_S1Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'distance',
    from: 0,
    to: 5,
    unit: 'm',
    startSec: 3.37,
    durationSec: 1.43,
    curve: 'linear'
  });

  const distM = -2 + driver.progress * 5;
  const curveRadius = 16;
  const wl = computeWheelsetLayout({
    distance: driver.value,
    curveStartZ: 2,
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
        <CurvedRail
          startZ={-10}
          curveStartZ={2}
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
          curveStartZ={2}
          curveRadius={curveRadius}
          palette="blueprint-navy"
        />
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: wl.center, size: [2.2, 2.0, 4.4] }}
          padding={1.25}
          startAngleDeg={-20}
          endAngleDeg={20}
        />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const Scene_S1: React.FC<Scene_S1Props> = ({ telemetry = false, hudData = [] }) => (
  <TelemetryProvider enabled={telemetry}>
    <StoryboardHudProvider items={hudData}>
      <Scene_S1Inner telemetry={telemetry} />
    </StoryboardHudProvider>
  </TelemetryProvider>
);