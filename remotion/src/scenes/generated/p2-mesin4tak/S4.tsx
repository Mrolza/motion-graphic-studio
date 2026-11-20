import React from 'react';
import { useCurrentFrame } from 'remotion';
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

export interface Scene_S4Props {
  telemetry?: boolean;
}

const Scene_S4Inner: React.FC = () => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 0,
    to: 720,
    unit: 'deg',
    startSec: 1.55,
    durationSec: 3.35,
    curve: 'linear',
  });

  const hudContent = (
    <HudLayout palette="blueprint-navy">
      <HudZone zone="title">
        <KineticTitle
          id="title_S4"
          title="Tenaga Mekanis"
          subtitle="Siklus berulang terus-menerus"
          palette="blueprint-navy"
        />
      </HudZone>
      <HudZone zone="callout">
        <Callout
          id="c4_callout"
          label="Tenaga Mekanis"
          detail="Siklus berulang terus-menerus"
          claimRef="C4"
          palette="blueprint-navy"
        />
        <StatCounter
          id="c1_stat"
          label="Total Sudut"
          driver={driver}
          bindToDriver
          decimals={0}
          unit="derajat"
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
        telemetry={false}
        hud={hudContent}
      >
        <CameraRig
          mode="frameEntities"
          framing="portrait-lower"
          focusBox={{
            center: [0, 1.65, 0],
            size: [1.5, 2.75, 1.5],
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

export const Scene_S4: React.FC<Scene_S4Props> = ({ telemetry = false }) => (
  <TelemetryProvider enabled={telemetry}>
    <Scene_S4Inner />
  </TelemetryProvider>
);