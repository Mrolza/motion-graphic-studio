import React from 'react';
import {
  TelemetryProvider,
  useDriver,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  Ground,
  PistonCrankAssembly,
  HudLayout,
  HudZone,
  KineticTitle,
  StatCounter,
  Callout
} from '../../../kit';

export interface Scene_S1Props {
  telemetry?: boolean;
}

const Scene_S1Inner: React.FC = () => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 0,
    to: 720,
    unit: 'deg',
    startSec: 0,
    durationSec: 8.52,
    curve: 'linear'
  });

  const hudContent = (
    <HudLayout palette="blueprint-navy">
      <HudZone zone="title">
        <KineticTitle
          id="title_S1"
          title="Mesin 4 Tak"
          subtitle="Prinsip Kerja Siklus"
          palette="blueprint-navy"
        />
      </HudZone>
      <HudZone zone="callout">
        <StatCounter
          id="counter_s1"
          label="Putaran Poros"
          driver={driver}
          bindToDriver
          decimals={0}
          unit="putaran"
          claimRef="C6"
          palette="blueprint-navy"
        />
        <Callout
          id="callout_s1"
          label="Siklus Kerja"
          detail="Dua putaran engkol untuk 4 langkah"
          claimRef="C1"
          palette="blueprint-navy"
        />
      </HudZone>
    </HudLayout>
  );

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage
        palette="blueprint-navy"
        hud={hudContent}
      >
        <CameraRig
          mode="frameEntities"
          framing="portrait-lower"
          focusBox={{
            center: [0, 1.65, 0],
            size: [1.5, 2.75, 1.5]
          }}
          padding={1.18}
          elevationDeg={10}
        />
        <Ground size={36} divisions={36} y={-0.55} />
        <PistonCrankAssembly
          entityId="piston_crank"
          crankAngleDeg={driver.value}
          position={[0, 0.45, 0]}
          cutaway
          palette="blueprint-navy"
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