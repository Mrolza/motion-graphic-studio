import React from 'react';
import {
  StoryboardHudProvider,
  TelemetryProvider,
  useDriver,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  Ground,
  RailCrossSection,
  ExaggerationBadge,
  HudLayout,
  HudZone,
  Hud,
  StoryboardHudDataItem
} from '../../../kit';

export interface Scene_S3Props {
  telemetry?: boolean;
  hudData?: StoryboardHudDataItem[];
}

const Scene_S3Inner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 0,
    to: 360,
    unit: '°',
    startSec: 0.47,
    durationSec: 10.07,
    curve: 'linear'
  });

  const lateralShift = 0.045 * Math.sin(driver.progress * Math.PI);

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage
        palette="blueprint-navy"
        telemetry={telemetry}
        hud={
          <HudLayout palette="blueprint-navy">
            <ExaggerationBadge factor={12} palette="blueprint-navy" />
            <HudZone zone="callout" palette="blueprint-navy">
              <Hud id="S3_H1" driver={driver} palette="blueprint-navy" />
              <Hud id="S3_H2" driver={driver} palette="blueprint-navy" />
            </HudZone>
          </HudLayout>
        }
      >
        <Ground size={40} divisions={40} y={0} />
        <RailCrossSection
          entityId="rail_cross_section"
          view="section"
          lateralShift={lateralShift}
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

export const Scene_S3: React.FC<Scene_S3Props> = ({ telemetry = false, hudData = [] }) => (
  <TelemetryProvider enabled={telemetry}>
    <StoryboardHudProvider items={hudData}>
      <Scene_S3Inner telemetry={telemetry} />
    </StoryboardHudProvider>
  </TelemetryProvider>
);