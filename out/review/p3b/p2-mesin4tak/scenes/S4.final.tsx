import React from 'react';
import {
  BlueprintStage,
  CameraRig,
  Ground,
  EngineBlock,
  HudLayout,
  HudZone,
  Hud,
  SceneTransition,
  StoryboardHudProvider,
  TelemetryProvider,
  useDriver,
  StoryboardHudDataItem
} from '../../../kit';

export interface Scene_S4Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S4Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crankAngleDeg',
    from: 0,
    to: 720,
    unit: '°',
    startSec: 1.55,
    durationSec: 3.35,
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
              <Hud id="S4_H1" driver={driver} palette="blueprint-navy" />
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
          focusBox={{ center: [0, 1.65, 0], size: [1.9, 2.8, 1.9] }}
          padding={1.25}
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