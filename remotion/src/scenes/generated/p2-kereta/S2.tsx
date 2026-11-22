import React from 'react';
import { useDriver, StoryboardHudProvider, TelemetryProvider, StoryboardHudDataItem, SceneTransition, BlueprintStage, CameraRig, HudLayout, HudZone, Ground, RailCrossSection, ExaggerationBadge, Hud } from '../../../kit';

export interface Scene_S2Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S2Inner: React.FC<{ telemetry?: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'lateral_shift',
    from: -5,
    to: 5,
    unit: 'mm',
    startSec: 2.31,
    durationSec: 8.11,
    curve: 'linear'
  });

  const lateralShiftVal = driver.unit === 'mm' ? driver.value * 0.001 : 0.045 * Math.sin(driver.progress * Math.PI);

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
            <HudZone zone="title" palette="blueprint-navy">
              <ExaggerationBadge factor={12} palette="blueprint-navy" />
            </HudZone>
          </HudLayout>
        }
      >
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: [0, 0.55, 0], size: [1.9, 1.15, 0.35] }}
          padding={1.15}
          startAngleDeg={0}
          endAngleDeg={0}
          elevationDeg={2}
        />
        <Ground size={40} divisions={40} y={0} />
        <RailCrossSection
          entityId="rail_cross_section"
          view="section"
          lateralShift={lateralShiftVal}
          taperExaggeration={12}
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