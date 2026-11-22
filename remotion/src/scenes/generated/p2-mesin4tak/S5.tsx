import React from 'react';
import { SceneTransition, BlueprintStage, CameraRig, Ground, EngineBlock, HudLayout, HudZone, Hud, useDriver, StoryboardHudProvider, StoryboardHudDataItem, TelemetryProvider } from '../../../kit';

export interface Scene_S5Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S5Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 0,
    to: 720,
    unit: '°',
    startSec: 4.07,
    durationSec: 0.8,
    curve: 'linear',
  });

  const hudContent = (
    <HudLayout palette="blueprint-navy">
      <HudZone zone="callout" palette="blueprint-navy">
        <Hud id="S5_H1" driver={driver} palette="blueprint-navy" />
      </HudZone>
      <HudZone zone="title" palette="blueprint-navy">
        <Hud id="S5_H2" driver={driver} palette="blueprint-navy" />
      </HudZone>
    </HudLayout>
  );

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage palette="blueprint-navy" telemetry={telemetry} hud={hudContent}>
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
          focusBox={{ center: [0, 1.72, 0], size: [2.05, 3.15, 2.05] }}
          padding={1.25}
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