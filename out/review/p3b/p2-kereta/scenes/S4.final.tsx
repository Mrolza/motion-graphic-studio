import React from 'react';
import { 
  BlueprintStage, 
  CameraRig, 
  Ground, 
  CurvedRail, 
  WheelsetOnRail, 
  computeWheelsetLayout, 
  Hud, 
  HudLayout, 
  HudZone, 
  SceneTransition, 
  TelemetryProvider, 
  StoryboardHudProvider, 
  useDriver, 
  StoryboardHudDataItem 
} from '../../../kit';

export interface Scene_S4Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S4Inner: React.FC<{ telemetry?: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'lateralShift',
    from: 5,
    to: 15,
    unit: 'mm',
    startSec: 0,
    durationSec: 9.46,
    curve: 'linear'
  });

  const wl = computeWheelsetLayout({
    distance: driver.value,
    curveStartZ: 2,
    curveRadius: 10
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
        <CurvedRail
          startZ={-10}
          curveStartZ={2}
          curveRadius={10}
          curveLength={18}
          gauge={1.435}
          highlighted
          palette="blueprint-navy"
        />
        <Ground size={60} divisions={60} y={0} />
        <WheelsetOnRail
          entityId="wheelset"
          distance={driver.value}
          taperExaggeration={4.5}
          curveStartZ={2}
          curveRadius={10}
          highlightContact
          palette="blueprint-navy"
        />
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: wl.center, size: [1.9, 1.25, 1.6] }}
          padding={1.85}
          elevationDeg={24}
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