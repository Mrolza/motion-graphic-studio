import React from 'react';
import {
  BlueprintStage,
  CameraRig,
  Ground,
  PistonCrankAssembly,
  MotionArrow,
  SceneTransition,
  StoryboardHudProvider,
  TelemetryProvider,
  HudLayout,
  HudZone,
  Hud,
  useDriver,
} from '../../../kit';

export interface Scene_S3Props {
  telemetry?: boolean;
  hudData?: any[];
}

const Scene_S3Inner: React.FC<{ telemetry?: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 180,
    to: 720,
    unit: '°',
    startSec: 0.55,
    durationSec: 18.22,
    curve: 'linear',
  });

  const pistonVel = [0, -Math.sin((driver.value * Math.PI) / 180), 0] as [number, number, number];

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
        <Ground size={36} divisions={36} y={-0.55} />
        <PistonCrankAssembly
          entityId="piston_crank"
          crankAngleDeg={driver.value}
          position={[0, 0.45, 0]}
          cutaway
          palette="blueprint-navy"
        />
        <MotionArrow
          bindToPart="piston"
          velocity={pistonVel}
          palette="blueprint-navy"
        />
        <CameraRig
          mode="frameEntities"
          framing="portrait-center"
          focusBox={{ center: [0, 0.95, 0], size: [1.45, 3.4, 1.45] }}
          padding={1.45}
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