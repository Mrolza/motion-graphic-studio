import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
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
  StatCounter,
} from '../../../kit';

export interface Scene_S2Props {
  telemetry?: boolean;
}

const Scene_S2Inner: React.FC<Scene_S2Props> = ({ telemetry = false }) => {
  const driver = useDriver({
    name: 'crank_angle',
    from: 0,
    to: 360,
    unit: 'deg',
    startSec: 0,
    durationSec: 12.48,
    curve: 'linear',
  });

  const hudContent = (
    <HudLayout palette="blueprint-navy">
      <HudZone zone="title">
        <KineticTitle
          id="title_S2"
          title="Langkah Hisap & Kompresi"
          subtitle="Udara dan bahan bakar masuk serta dipadatkan"
          palette="blueprint-navy"
        />
      </HudZone>
      <HudZone zone="callout">
        <Callout
          id="c1"
          label="Langkah Hisap & Kompresi"
          detail="Udara dan bahan bakar masuk"
          claimRef="C2"
          palette="blueprint-navy"
        />
        <StatCounter
          id="c2"
          label="Sudut Engkol"
          decimals={0}
          unit="derajat"
          driver={driver}
          bindToDriver
          claimRef="C3"
          palette="blueprint-navy"
        />
      </HudZone>
    </HudLayout>
  );

  return (
    <SceneTransition
      variant="fade"
      durationSec={0.25}
      palette="blueprint-navy"
    >
      <BlueprintStage
        palette="blueprint-navy"
        telemetry={telemetry}
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

export const Scene_S2: React.FC<Scene_S2Props> = ({
  telemetry = false,
}) => (
  <TelemetryProvider enabled={telemetry}>
    <Scene_S2Inner telemetry={telemetry} />
  </TelemetryProvider>
);