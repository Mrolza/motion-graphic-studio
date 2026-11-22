import React from 'react';
import {
  TelemetryProvider,
  StoryboardHudProvider,
  StoryboardHudDataItem,
  useDriver,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  HudLayout,
  HudZone,
  Hud,
  CurvedRail,
  Ground,
  WheelsetOnRail,
  computeWheelsetLayout
} from '../../../kit';

export interface Scene_S3Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S3Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'effective_diameter',
    from: 0,
    to: 10,
    unit: 'mm',
    startSec: 0,
    durationSec: 8.82,
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
            <HudZone zone="callout" palette="blueprint-navy">
              <Hud id="S3_H1" driver={driver} palette="blueprint-navy" />
            </HudZone>
          </HudLayout>
        }
      >
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: wl.center, size: [1.9, 1.25, 1.6] }}
          padding={1.25}
          elevationDeg={22}
          startAngleDeg={-20}
          endAngleDeg={20}
          durationSec={8.82}
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
          showEffectiveDiameter
          palette="blueprint-navy"
        />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const Scene_S3: React.FC<Scene_S3Props> = ({ telemetry = false, hudData = [] }) => (
  <TelemetryProvider enabled={telemetry}>
    <StoryboardHudProvider items={hudData}>
      <Scene_S3Inner telemetry={telemetry} />
    </StoryboardHudProvider>
  </TelemetryProvider>
);