import React from 'react';
import { useCurrentFrame } from 'remotion';
import {
  TelemetryProvider,
  useDriver,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  Ground,
  CurvedRail,
  WheelsetOnRail,
  HudLayout,
  HudZone,
  KineticTitle,
  MeasureReveal,
  Callout
} from '../../../kit';

export interface Scene_S2Props {
  telemetry?: boolean;
}

const Scene_S2Inner: React.FC<Scene_S2Props> = ({ telemetry = false }) => {
  const driver = useDriver({
    name: 'distance',
    from: -3,
    to: 3,
    unit: 'm',
    startSec: 1.93,
    durationSec: 8.15,
    curve: 'linear'
  });

  const hudContent = (
    <HudLayout palette="blueprint-navy">
      <HudZone zone="title">
        <KineticTitle
          id="title_S2"
          title="Bentuk Kerucut Roda Kereta"
          subtitle="Desain optimal untuk melalui tikungan rel"
          palette="blueprint-navy"
        />
      </HudZone>
      <HudZone zone="callout">
        <MeasureReveal
          id="m1"
          label="Kemiringan Roda"
          valueText="1:20"
          claimRef="C1"
          palette="blueprint-navy"
        />
        <Callout
          id="c1"
          label="Gerakan Halus"
          detail="Mencegah flens bergesekan langsung"
          claimRef="C2"
          palette="blueprint-navy"
        />
      </HudZone>
    </HudLayout>
  );

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage palette="blueprint-navy" telemetry={telemetry} hud={hudContent}>
        <CameraRig
          mode="frameEntities"
          framing="portrait-lower"
          focusBox={{ center: [0, 0.7, driver.value], size: [1.9, 1.25, 1.6] }}
          padding={1.85}
          elevationDeg={24}
        />
        <Ground size={60} divisions={60} y={0} />
        <CurvedRail
          startZ={-10}
          curveStartZ={2}
          curveRadius={10}
          curveLength={18}
          gauge={1.435}
          highlighted
          palette="blueprint-navy"
        />
        <WheelsetOnRail
          entityId="wheelset"
          distance={driver.value}
          taperExaggeration={4.5}
          highlightContact
          palette="blueprint-navy"
        />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const Scene_S2: React.FC<Scene_S2Props> = ({ telemetry = false }) => (
  <TelemetryProvider enabled={telemetry}>
    <Scene_S2Inner telemetry={telemetry} />
  </TelemetryProvider>
);