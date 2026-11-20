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
  Callout,
  StatCounter
} from '../../../kit';

export interface Scene_S3Props {
  telemetry?: boolean;
}

const Scene_S3Inner: React.FC = () => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 360,
    to: 720,
    unit: 'deg',
    startSec: 0,
    durationSec: 10.97,
    curve: 'linear'
  });

  const hudContent = (
    <HudLayout palette="blueprint-navy">
      <HudZone zone="title">
        <KineticTitle
          id="title_S3"
          title="Langkah Tenaga & Buang"
          subtitle="Ekspansi gas dan pembuangan sisa"
          palette="blueprint-navy"
        />
      </HudZone>
      <HudZone zone="callout">
        <Callout
          id="c9"
          label="Siklus Daya"
          detail="Tekanan tinggi mendorong piston"
          claimRef="C9"
          palette="blueprint-navy"
        />
        <StatCounter
          id="c5"
          label="Sudut Engkol"
          driver={driver}
          bindToDriver
          decimals={0}
          unit="°"
          claimRef="C5"
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
        <Ground size={36} divisions={36} y={-0.55} />
        <PistonCrankAssembly
          entityId="piston_crank"
          crankAngleDeg={driver.value}
          position={[0, 0.45, 0]}
          cutaway
          palette="blueprint-navy"
        />
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
      </BlueprintStage>
    </SceneTransition>
  );
};

export const Scene_S3: React.FC<Scene_S3Props> = ({ telemetry = false }) => (
  <TelemetryProvider enabled={telemetry}>
    <Scene_S3Inner />
  </TelemetryProvider>
);