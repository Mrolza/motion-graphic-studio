import React from 'react';
import {
  StoryboardHudProvider,
  TelemetryProvider,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  Ground,
  EngineBlock,
  HudLayout,
  HudZone,
  Hud,
  useDriver,
  StoryboardHudDataItem,
} from '../../../kit';

export interface Scene_S1Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S1Inner: React.FC<{ telemetry?: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 0,
    to: 90,
    unit: '°',
    startSec: 1.29,
    durationSec: 8.05,
    curve: 'linear',
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
        <Ground size={36} divisions={36} y={-0.55} />
        <EngineBlock
          entityId="engine_block"
          crankAngleDeg={driver.value}
          cutawayProgress={driver.progress}
          position={[0, 0.45, 0]}
          palette="blueprint-navy"
        />
        <CameraRig
          mode="frameEntities"
          focusBox={{
            center: [0, 1.72, 0],
            size: [2.05, 3.15, 2.05],
          }}
          padding={1.25}
        />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const Scene_S1: React.FC<Scene_S1Props> = ({
  telemetry = false,
  hudData = [],
}) => (
  <TelemetryProvider enabled={telemetry}>
    <StoryboardHudProvider items={hudData}>
      <Scene_S1Inner telemetry={telemetry} />
    </StoryboardHudProvider>
  </TelemetryProvider>
);