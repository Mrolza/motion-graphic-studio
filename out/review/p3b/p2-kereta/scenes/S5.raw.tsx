import React from 'react';
import {
  BlueprintStage,
  CameraRig,
  Ground,
  CurvedRail,
  TrainCar,
  computeWheelsetLayout,
  SceneTransition,
  StoryboardHudProvider,
  TelemetryProvider,
  HudLayout,
  HudZone,
  Hud,
  useDriver,
  StoryboardHudDataItem
} from '../../../kit';

export interface Scene_S5Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S5Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'distance',
    from: 0,
    to: 5,
    unit: 'm',
    startSec: 3.61,
    durationSec: 0.9,
    curve: 'linear'
  });

  const wl = computeWheelsetLayout({
    distance: driver.value,
    curveStartZ: 2,
    curveRadius: 10
  });

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage
        palette="blueprint-navy"
        telemetry={telemetry}
        hud={
          <HudLayout palette="blueprint-navy">
            <HudZone zone="title" palette="blueprint-navy">
              <Hud id="S5_H1" driver={driver} palette="blueprint-navy" />
            </HudZone>
          </HudLayout>
        }
      >
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: wl.center, size: [2.4, 2.2, 5.8] }}
          padding={1.5}
          elevationDeg={15}
        />
        <Ground size={60} divisions={60} y={0} />
        <CurvedRail
          startZ={-10}
          curveStartZ={2}
          curveRadius={10}
          curveLength={18}
          gauge={1.435}
          highlighted
          palette="blueprint-navy"
        />
        <TrainCar
          entityId="train_car"
          distance={driver.value}
          curveStartZ={2}
          curveRadius={10}
          palette="blueprint-navy"
        />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const Scene_S5: React.FC<Scene_S5Props> = ({ telemetry = false, hudData = [] }) => (
  <TelemetryProvider enabled={telemetry}>
    <StoryboardHudProvider items={hudData}>
      <Scene_S5Inner telemetry={telemetry} />
    </StoryboardHudProvider>
  </TelemetryProvider>
);