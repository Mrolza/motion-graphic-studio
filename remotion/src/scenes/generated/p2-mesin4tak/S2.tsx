import React from 'react';
import { SceneTransition, BlueprintStage, CameraRig, Ground, PistonCrankAssembly, HudLayout, HudZone, Hud, useDriver, TelemetryProvider, StoryboardHudProvider, StoryboardHudDataItem } from '../../../kit';

export interface Scene_S2Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S2Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 0,
    to: 720,
    unit: '°',
    startSec: 0,
    durationSec: 4.87,
    curve: 'linear',
  });

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage
        palette="blueprint-navy"
        telemetry={telemetry}
        hud={
          <HudLayout palette="blueprint-navy">
            <HudZone zone="callout" palette="blueprint-navy">
              <Hud id="S2_H1" driver={driver} palette="blueprint-navy" />
              <Hud id="S2_H2" driver={driver} palette="blueprint-navy" />
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
          startAngleDeg={0}
          endAngleDeg={0}
        />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const Scene_S2: React.FC<Scene_S2Props> = ({
  telemetry = false,
  hudData = [],
}) => (
  <TelemetryProvider enabled={telemetry}>
    <StoryboardHudProvider items={hudData}>
      <Scene_S2Inner telemetry={telemetry} />
    </StoryboardHudProvider>
  </TelemetryProvider>
);