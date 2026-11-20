import React from 'react';
import {
  TelemetryProvider,
  useDriver,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  CurvedRail,
  Ground,
  WheelsetOnRail,
  HudLayout,
  HudZone,
  KineticTitle,
  Callout,
  MeasureReveal
} from '../../../kit';

export interface Scene_S1Props {
  telemetry?: boolean;
}

const Scene_S1Inner: React.FC = () => {
  const driver = useDriver({
    name: 'distance',
    from: -2,
    to: 2,
    unit: 'm',
    startSec: 2.35,
    durationSec: 2.16,
    curve: 'linear',
  });

  const hudContent = (
    <HudLayout palette="blueprint-navy">
      <HudZone zone="title">
        <KineticTitle
          id="title_S1"
          title="Stabilitas Rel"
          subtitle="Tanpa Setir"
          palette="blueprint-navy"
        />
      </HudZone>
      <HudZone zone="callout">
        <MeasureReveal
          id="m1"
            label="Lebar Spoor"
            valueText="1.435 m"
            claimRef="C1"
            palette="blueprint-navy"
        />
        <Callout
          id="c1"
          label="Kontak Flensa"
          detail="Mencegah anjlok tanpa mekanisme kemudi"
          claimRef="C1"
          palette="blueprint-navy"
        />
      </HudZone>
    </HudLayout>
  );

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage palette="blueprint-navy" hud={hudContent}>
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
          focusBox={{
            center: [0, 0.7, driver.value],
            size: [1.9, 1.25, 1.6],
          }}
          padding={1.85}
          elevationDeg={24}
        />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const Scene_S1: React.FC<Scene_S1Props> = ({ telemetry = false }) => (
  <TelemetryProvider enabled={telemetry}>
    <Scene_S1Inner />
  </TelemetryProvider>
);