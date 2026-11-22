import React from 'react';
import {
  StoryboardHudProvider,
  TelemetryProvider,
  useDriver,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  HudLayout,
  HudZone,
  Hud,
  CurvedRail,
  Ground,
  TrainCar,
  computeWheelsetLayout,
  StoryboardHudDataItem
} from '../../../kit';

export interface Scene_S5Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S5Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'progress',
    from: 0,
    to: 100,
    unit: '%',
    startSec: 3.61,
    durationSec: 0.9,
    curve: 'linear'
  });

  const distM = driver.unit === '%' ? -2 + driver.progress * 6 : driver.value;
  const wl = computeWheelsetLayout({ distance: distM, curveStartZ: 2, curveRadius: 10 });

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage
        palette="blueprint-navy"
        telemetry={telemetry}
        hud={
          <HudLayout palette="blueprint-navy">
            <HudZone zone="callout" palette="blueprint-navy">
              <Hud id="S5_H1" driver={driver} palette="blueprint-navy" />
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
          distance={distM}
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