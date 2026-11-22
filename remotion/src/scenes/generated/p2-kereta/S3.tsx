import React from 'react';
import { SceneTransition, BlueprintStage, CameraRig, Ground, CurvedRail, WheelsetOnRail, HudLayout, HudZone, Hud, DiagramOverlay, useDriver, computeWheelsetLayout, TelemetryProvider, StoryboardHudProvider, StoryboardHudDataItem } from '../../../kit';

export interface Scene_S3Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S3Inner: React.FC<{ telemetry?: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'progress',
    from: 0,
    to: 100,
    unit: '%',
    startSec: 1.44,
    durationSec: 7.1,
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
            <DiagramOverlay curveArc inertiaArrow palette="blueprint-navy" />
            <HudZone zone="callout" palette="blueprint-navy">
              <Hud id="S3_H1" driver={driver} palette="blueprint-navy" />
              <Hud id="S3_H2" driver={driver} palette="blueprint-navy" />
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
        <WheelsetOnRail
          entityId="wheelset"
          distance={driver.value}
          taperExaggeration={4.5}
          curveStartZ={2}
          curveRadius={10}
          highlightContact
          palette="blueprint-navy"
        />
        <CameraRig
          mode="frameEntities"
          focusBox={{
            center: wl.center,
            size: [1.9, 1.25, 1.6],
          }}
          padding={1.25}
          elevationDeg={22}
          startAngleDeg={-22}
          endAngleDeg={22}
          durationSec={8.542}
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