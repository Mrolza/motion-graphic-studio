import React from 'react';
import {
  TelemetryProvider,
  StoryboardHudProvider,
  StoryboardHudDataItem,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  Ground,
  PistonCrankAssembly,
  HudLayout,
  HudZone,
  Hud,
  useDriver
} from '../../../kit';

export interface Scene_S3Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S3Inner: React.FC<{ telemetry?: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 0,
    to: 180,
    unit: '°',
    startSec: 0,
    durationSec: 5.53,
    curve: 'linear'
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
        <Ground size={36} divisions={36} y={-0.55} />
        <PistonCrankAssembly
          entityId="piston_crank"
          crankAngleDeg={driver.value}
          position={[0, 0.45, 0]}
          cutaway
          palette="blueprint-navy"
        />
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: [0, 1.72, 0], size: [1.35, 3.15, 1.35] }}
          padding={1.22}
          elevationDeg={12}
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