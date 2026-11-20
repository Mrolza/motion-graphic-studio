import React from 'react';
import {
  TelemetryProvider,
  SceneTransition,
  BlueprintStage,
  CameraRig,
  Ground,
  CurvedRail,
  WheelsetOnRail,
  useDriver,
  HudLayout,
  HudZone,
  KineticTitle,
  MeasureReveal,
  Callout
} from '../../../kit';

export interface Scene_S4Props {
  telemetry?: boolean;
}

const Scene_S4Inner: React.FC = () => {
  const driver = useDriver({
    name: 'distance',
    from: -2,
    to: 4,
    unit: 'm',
    startSec: 6.19,
    durationSec: 3.27,
    curve: 'linear'
  });

  return (
    <SceneTransition variant="fade" durationSec={0.25} palette="blueprint-navy">
      <BlueprintStage
        palette="blueprint-navy"
        hud={
          <HudLayout palette="blueprint-navy">
            <HudZone zone="title">
              <KineticTitle
                id="title_S4"
                title="Diameter Efektif & Gandar"
                subtitle="Perubahan geometri roda pada tikungan"
                palette="blueprint-navy"
              />
            </HudZone>
            <HudZone zone="callout">
              <MeasureReveal
                id="m_efektif"
                label="Diameter Efektif"
                valueText="Berubah Dinamis"
                claimRef="C3"
                palette="blueprint-navy"
              />
              <Callout
                id="c_gandar"
                label="Aksi Gandar Kaku"
                detail="Roda luar menempuh jarak lebih jauh"
                claimRef="C3"
                palette="blueprint-navy"
              />
            </HudZone>
          </HudLayout>
        }
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
          showEffectiveDiameter
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