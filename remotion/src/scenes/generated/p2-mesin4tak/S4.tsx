import React from 'react';
import {
  StoryboardHudProvider,
  TelemetryProvider,
  useDriver,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  Ground,
  PistonCrankAssembly,
  MotionArrow,
  HudLayout,
  HudZone,
  Hud,
  StoryboardHudDataItem
} from '../../../kit';

export interface Scene_S4Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S4Inner: React.FC<{ telemetry?: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 360,
    to: 720,
    unit: '°',
    startSec: 0.44,
    durationSec: 9.85,
    curve: 'linear'
  });

  const pistonVel = -Math.sin((driver.value * Math.PI) / 180);

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage
        palette="blueprint-navy"
        telemetry={telemetry}
        hud={
          <HudLayout palette="blueprint-navy">
            <HudZone zone="callout" palette="blueprint-navy">
              <Hud id="S4_H1" driver={driver} palette="blueprint-navy" />
              <Hud id="S4_H2" driver={driver} palette="blueprint-navy" />
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
          velocity={[0, pistonVel, 0]}
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

export const Scene_S4: React.FC<Scene_S4Props> = ({ telemetry = false, hudData = [] }) => (
  <TelemetryProvider enabled={telemetry}>
    <StoryboardHudProvider items={hudData}>
      <Scene_S4Inner telemetry={telemetry} />
    </StoryboardHudProvider>
  </TelemetryProvider>
);