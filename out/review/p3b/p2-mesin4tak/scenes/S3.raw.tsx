import React from 'react';
import {
  BlueprintStage,
  CameraRig,
  Ground,
  Hud,
  HudLayout,
  HudZone,
  PistonCrankAssembly,
  SceneTransition,
  StoryboardHudProvider,
  StoryboardHudDataItem,
  TelemetryProvider,
  useDriver
} from '../../../kit';

export interface Scene_S3Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S3Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crankAngleDeg',
    from: 360,
    to: 720,
    unit: '°',
    startSec: 0,
    durationSec: 10.97,
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
              <Hud id="S3_H2" driver={driver} palette="blueprint-navy" />
            </HudZone>
          </HudLayout>
        }
      >
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: [0, 1.65, 0], size: [1.5, 2.75, 1.5] }}
          padding={1.18}
          elevationDeg={10}
        />
        <Ground size={36} divisions={36} y={-0.55} />
        <PistonCrankAssembly
          entityId="piston_crank"
          crankAngleDeg={driver.value}
          position={[0, 0.45, 0]}
          cutaway
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