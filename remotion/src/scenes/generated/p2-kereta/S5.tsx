import React from 'react';
import {
  StoryboardHudProvider,
  TelemetryProvider,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  Ground,
  CurvedRail,
  WheelsetOnRail,
  HudLayout,
  HudZone,
  Hud,
  computeWheelsetLayout,
  useDriver
} from '../../../kit';

export interface Scene_S5Props {
  telemetry?: boolean;
  hudData?: any[];
}

const Scene_S5Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'distance',
    from: 0,
    to: 5,
    unit: 'm',
    startSec: 0,
    durationSec: 5.01,
    curve: 'linear'
  });

  const wl = computeWheelsetLayout({ distance: driver.value, curveStartZ: 2, curveRadius: 10 });

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
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: wl.center, size: [1.9, 1.25, 1.6] }}
          padding={1.25}
          elevationDeg={22}
          startAngleDeg={-15}
          endAngleDeg={15}
          durationSec={5.01}
        />
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
        <WheelsetOnRail
          entityId="wheelset"
          distance={driver.value}
          taperExaggeration={4.5}
          curveStartZ={2}
          curveRadius={10}
          highlightContact
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