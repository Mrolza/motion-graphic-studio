import React from 'react';
import {
  TelemetryProvider,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  Ground,
  WheelsetOnRail,
  CurvedRail,
  HudLayout,
  HudZone,
  KineticTitle,
  Callout,
  MeasureReveal,
  useDriver
} from '../../../kit';

export interface Scene_S3Props {
  telemetry?: boolean;
}

const Scene_S3Inner: React.FC<Scene_S3Props> = ({ telemetry = false }) => {
  const driver = useDriver({
    name: 'distance',
    from: 0,
    to: 5,
    unit: 'm',
    startSec: 1.44,
    durationSec: 7.68,
    curve: 'linear'
  });

  const hudContent = (
    <HudLayout palette="blueprint-navy">
      <HudZone zone="title">
        <KineticTitle
          id="title_S3"
          title="Inersia & Geseran Roda"
          subtitle="Kendaraan melaju lurus di tikungan"
          palette="blueprint-navy"
        />
      </HudZone>
      <HudZone zone="callout">
        <Callout
          id="c1"
          label="Inersia Tikungan"
          detail="Kecenderungan melaju lurus ke arah rel luar"
          claimRef="C2"
          palette="blueprint-navy"
        />
        <MeasureReveal
          id="m1"
          label="Jarak Tempuh"
          valueText="5,0 m"
          claimRef="C2"
          palette="blueprint-navy"
        />
      </HudZone>
    </HudLayout>
  );

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage
        palette="blueprint-navy"
        telemetry={telemetry}
        hud={hudContent}
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
          highlightContact
          palette="blueprint-navy"
        />
        <CameraRig
          mode="frameEntities"
          framing="portrait-lower"
          focusBox={{ center: [0, 0.7, driver.value], size: [1.9, 1.25, 1.6] }}
          padding={1.85}
          elevationDeg={24}
        />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const Scene_S3: React.FC<Scene_S3Props> = ({ telemetry = false }) => (
  <TelemetryProvider enabled={telemetry}>
    <Scene_S3Inner telemetry={telemetry} />
  </TelemetryProvider>
);