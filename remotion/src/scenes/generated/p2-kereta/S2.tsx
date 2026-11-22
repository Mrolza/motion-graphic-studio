import React from 'react';
import { SceneTransition, BlueprintStage, CameraRig, Ground, RailCrossSection, ExaggerationBadge, HudLayout, HudZone, Hud, StoryboardHudProvider, TelemetryProvider, useDriver, StoryboardHudDataItem } from '../../../kit';

export interface Scene_S2Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S2Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'lateral_shift',
    from: 0,
    to: 15,
    unit: 'mm',
    startSec: 4.17,
    durationSec: 6.07,
    curve: 'linear'
  });

  const lateralShiftMeters = driver.unit === 'mm' ? driver.value * 0.001 : 0.045 * Math.sin(driver.progress * Math.PI);

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
            <ExaggerationBadge factor={12} palette="blueprint-navy" />
          </HudLayout>
        }
      >
        <Ground size={40} divisions={40} y={0} />
        <RailCrossSection
          entityId="rail_cross_section"
          view="section"
          lateralShift={lateralShiftMeters}
          taperExaggeration={12}
          palette="blueprint-navy"
        />
        <CameraRig
          mode="frameEntities"
          focusBox={{ center: [0, 0.55, 0], size: [1.9, 1.15, 0.35] }}
          padding={1.15}
          startAngleDeg={0}
          endAngleDeg={0}
          elevationDeg={2}
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