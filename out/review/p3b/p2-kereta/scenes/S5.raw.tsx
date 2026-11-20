import React from 'react';
import {
  TelemetryProvider,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  WheelsetOnRail,
  CurvedRail,
  Ground,
  HudLayout,
  HudZone,
  KineticTitle,
  Callout,
  useDriver
} from '../../../kit';

export interface Scene_S5Props {
  telemetry?: boolean;
}

const Scene_S5Inner: React.FC<Scene_S5Props> = ({ telemetry }) => {
  const driver = useDriver({
    name: 'distance',
    from: -1,
    to: 1,
    unit: 'm',
    startSec: 3.61,
    durationSec: 0.9,
    curve: 'linear'
  });

  const hudContent = (
    <HudLayout palette="blueprint-navy">
      <HudZone zone="title">
        <KineticTitle
          id="title_S5"
          title="Efisiensi Kurva Jalur"
          subtitle="Mekanisme fisika pergerakan roda"
          palette="blueprint-navy"
        />
      </HudZone>
      <HudZone zone="callout">
        <Callout
          id="c3"
          label="Mekanisme Fisika"
          detail="Efisiensi kurva jalur"
          claimRef="C3"
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
        <CameraRig
          mode="frameEntities"
          framing="portrait-lower"
          focusBox={{
            center: [0, 0.7, driver.value],
            size: [1.9, 1.25, 1.6]
          }}
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

export const Scene_S5: React.FC<Scene_S5Props> = ({ telemetry = false }) => (
  <TelemetryProvider enabled={telemetry}>
    <Scene_S5Inner telemetry={telemetry} />
  </TelemetryProvider>
);