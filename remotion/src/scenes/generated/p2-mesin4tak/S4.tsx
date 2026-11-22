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
  useDriver
} from '../../../kit';

export interface Scene_S4Props {
  telemetry?: boolean;
  hudData?: any[];
}

const Scene_S4Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 0,
    to: 720,
    unit: '°',
    startSec: 1.53,
    durationSec: 3.18,
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
              <Hud id="S4_H1" driver={driver} palette="blueprint-navy" />
            </HudZone>
          </HudLayout>
        }
      >
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: [0, 1.72, 0], size: [2.05, 3.15, 2.05] }}
          padding={0.55}
          startAngleDeg={-22}
          endAngleDeg={22}
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

export const Scene_S4: React.FC<Scene_S4Props> = ({ telemetry = false, hudData = [] }) => (
  <TelemetryProvider enabled={telemetry}>
    <StoryboardHudProvider items={hudData}>
      <Scene_S4Inner telemetry={telemetry} />
    </StoryboardHudProvider>
  </TelemetryProvider>
);