import React from 'react';
import { 
  BlueprintStage, 
  CameraRig, 
  Ground, 
  CylinderSection, 
  SceneTransition, 
  HudLayout, 
  HudZone, 
  Hud, 
  useDriver, 
  StoryboardHudProvider, 
  TelemetryProvider,
  StoryboardHudDataItem 
} from '../../../kit';

export interface Scene_S2Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S2Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 0,
    to: 180,
    unit: '°',
    startSec: 4.96,
    durationSec: 0.8,
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
              <Hud id="S2_H1" driver={driver} palette="blueprint-navy" />
            </HudZone>
          </HudLayout>
        }
      >
        <CameraRig
          mode="frameEntities"
          focusBox={{
            center: [0, 1.72, 0],
            size: [1.55, 3.05, 0.95]
          }}
          padding={1.18}
          startAngleDeg={0}
          endAngleDeg={0}
          elevationDeg={2}
        />
        <Ground size={36} divisions={36} y={-0.55} />
        <CylinderSection
          entityId="cylinder_section"
          view="section"
          crankAngleDeg={driver.value}
          position={[0, 0.35, 0]}
          palette="blueprint-navy"
        />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const Scene_S2: React.FC<Scene_S2Props> = ({ telemetry = false, hudData = [] }) => (
  <TelemetryProvider enabled={telemetry}>
    <StoryboardHudProvider items={hudData}>
      <Scene_S2Inner telemetry={telemetry} />
    </StoryboardHudProvider>
  </TelemetryProvider>
);