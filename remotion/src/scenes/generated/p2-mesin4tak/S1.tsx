import React from 'react';
import {
  TelemetryProvider,
  StoryboardHudProvider,
  StoryboardHudDataItem,
  useDriver,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  Ground,
  EngineBlock,
  HudLayout,
  HudZone,
  Hud
} from '../../../kit';

export interface Scene_S1Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

export const Scene_S1: React.FC<Scene_S1Props> = ({ telemetry = false, hudData = [] }) => (
  <TelemetryProvider enabled={telemetry}>
    <StoryboardHudProvider items={hudData}>
      <Scene_S1Inner telemetry={telemetry} />
    </StoryboardHudProvider>
  </TelemetryProvider>
);

const Scene_S1Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crankAngleDeg',
    from: 0,
    to: 720,
    unit: '°',
    startSec: 0,
    durationSec: 8.52,
    curve: 'linear'
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
            <HudZone zone="callout" palette="blueprint-navy">
              <Hud id="S1_H2" driver={driver} palette="blueprint-navy" />
            </HudZone>
          </HudLayout>
        }
      >
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: [0, 1.65, 0], size: [1.9, 2.8, 1.9] }}
          padding={1.25}
          startAngleDeg={15}
          endAngleDeg={75}
          durationSec={8.52}
          elevationDeg={20}
        />
        <Ground size={36} divisions={36} y={-0.55} />
        <EngineBlock
          entityId="engine_block"
          crankAngleDeg={driver.value}
          cutawayProgress={driver.progress}
          position={[0, 0.45, 0]}
          palette="blueprint-navy"
        />
      </BlueprintStage>
    </SceneTransition>
  );
};