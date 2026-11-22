import React from 'react';
import {
  TelemetryProvider,
  StoryboardHudProvider,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  Ground,
  CurvedRail,
  TrainCar,
  HudLayout,
  HudZone,
  Hud,
  computeWheelsetLayout,
  useDriver,
  StoryboardHudDataItem
} from '../../../kit';

export interface Scene_S1Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S1Inner: React.FC<{ telemetry?: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'distance',
    from: 0,
    to: 5,
    unit: 'm',
    startSec: 2.35,
    durationSec: 2.16,
    curve: 'linear',
  });

  const wl = computeWheelsetLayout({
    distance: driver.value,
    curveStartZ: 2,
    curveRadius: 10,
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
          curveRadius={10}
          curveLength={18}
          gauge={1.435}
          highlighted
          palette="blueprint-navy"
        />
        <Ground size={60} divisions={60} y={0} />
        <TrainCar
          entityId="train_car"
          distance={driver.value}
          curveStartZ={2}
          curveRadius={10}
          palette="blueprint-navy"
        />
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: wl.center, size: [2.2, 2.0, 4.4] }}
          padding={1.22}
          startAngleDeg={-22}
          endAngleDeg={22}
          durationSec={4.512}
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