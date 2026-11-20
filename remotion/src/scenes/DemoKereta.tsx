import React from 'react';
import {
  Arrow3D,
  BlueprintStage,
  Callout,
  CameraRig,
  CompareCard,
  computeWheelsetLayout,
  CurvedRail,
  Ground,
  HudLayout,
  HudZone,
  KineticTitle,
  MeasureReveal,
  ParallaxForeground,
  SceneTransition,
  TelemetryProvider,
  useDriver,
  useSceneTime,
  WheelsetOnRail,
} from '../kit';

export interface DemoKeretaProps {
  telemetry?: boolean;
  mutation?:
    | 'framing'
    | 'hud-overlap'
    | 'hud-format'
    | 'lift-wheel'
    | 'rotate-axle'
    | 'three-panels';
}

const DemoKeretaHud: React.FC<{
  sec: number;
  mutation?: DemoKeretaProps['mutation'];
}> = ({ sec, mutation }) => {
  const isSceneA = sec < 5;
  const isSceneB = sec >= 5 && sec < 10;

  const subtitle = isSceneA
    ? 'Adegan A: Bentuk kerucut 1:20 (skala dilebih-lebihkan)'
    : isSceneB
    ? 'Adegan B: Inersia di tikungan menggeser ke rel luar'
    : 'Adegan C: Diameter efektif roda luar lebih besar';

  return (
    <HudLayout palette="blueprint-navy">
      <HudZone zone="title" palette="blueprint-navy">
        <KineticTitle
          id="title_kereta"
          title="Mengapa Kereta Bisa Berbelok?"
          subtitle={subtitle}
          palette="blueprint-navy"
        />
      </HudZone>

      <HudZone zone="callout" palette="blueprint-navy">
        {isSceneA ? (
          <>
            <MeasureReveal
              id="measure_taper"
              label="Kemiringan Tapak Kerucut"
              valueText={mutation === 'hud-format' ? '1,435 mm (1:20)' : '1:20 (dilebihkan)'}
              startSec={0.4}
              durationSec={0.8}
              claimRef="C1"
              palette="blueprint-navy"
            />
            {mutation !== 'hud-overlap' ? (
              <Callout
                id="callout_flange"
                label="Flens di Sisi Dalam"
                detail="Mencegah roda keluar rel"
                claimRef="C1"
                palette="blueprint-navy"
              />
            ) : null}
          </>
        ) : isSceneB ? (
          <Callout
            id="callout_inertia"
            label="Inersia Kendaraan (C2)"
            detail="Roda cenderung lurus → bergeser ke rel luar"
            claimRef="C2"
            palette="blueprint-navy"
          />
        ) : (
          <>
            <CompareCard
              id="compare_diameter"
              leftTitle="Roda Dalam"
              leftValue="Diameter lebih kecil"
              rightTitle="Roda Luar"
              rightValue="Diameter lebih besar"
              palette="blueprint-navy"
            />
            <Callout
              id="callout_effective"
              label="Gandar Kaku (C3)"
              detail="Roda luar menempuh jarak lebih jauh"
              claimRef="C3"
              palette="blueprint-navy"
            />
          </>
        )}

        {mutation === 'three-panels' ? (
          <Callout
            id="callout_extra_budget"
            label="Panel Tambahan"
            detail="Melebihi anggaran 2 panel HUD"
            palette="blueprint-navy"
          />
        ) : null}
      </HudZone>

      {mutation === 'hud-overlap' ? (
        <Callout
          id="callout_flange"
          label="Flens di Sisi Dalam"
          detail="Bertumpuk dengan MeasureReveal"
          screenAnchor={[48, 865]}
          palette="blueprint-navy"
        />
      ) : null}
    </HudLayout>
  );
};

const DemoKeretaInner: React.FC<DemoKeretaProps> = ({
  telemetry = false,
  mutation,
}) => {
  const { sec } = useSceneTime();
  const distance = useDriver({
    name: 'distance',
    from: -5.5,
    to: 12.5,
    unit: 'm',
    startSec: 0,
    durationSec: 15,
    curve: 'linear',
  });

  // Shift smoothly outward (+X toward outer rail) as wheelset enters the curve at z = 2
  const curveStartZ = 2;
  const curveRadius = 10;
  const lateralShift =
    distance.value <= curveStartZ
      ? 0
      : Math.min(0.16, ((distance.value - curveStartZ) / 4) * 0.16);

  const layout = computeWheelsetLayout({
    distance: distance.value,
    lateralShift,
    wheelRadius: 0.46,
    gauge: 1.435,
    coneRatio: 0.05,
    railHeadTopY: 0.22,
    curveStartZ,
    curveRadius,
  });

  const hud = <DemoKeretaHud sec={sec} mutation={mutation} />;

  return (
    <SceneTransition variant="wipe-grid" durationSec={0.35} palette="blueprint-navy">
      <BlueprintStage palette="blueprint-navy" telemetry={telemetry} hud={hud}>
        {mutation === 'framing' ? (
          <CameraRig
            mode="dolly"
            from={[layout.center[0] + 4.8, 1.8, layout.center[2]]}
            to={[layout.center[0] + 4.8, 1.8, layout.center[2]]}
            target={[layout.center[0] + 4.8, 0.7, layout.center[2]]}
            fov={42}
          />
        ) : (
          <CameraRig
            mode="frameEntities"
            framing="portrait-lower"
            focusBox={{ center: [layout.center[0], 0.7, layout.center[2]], size: [1.9, 1.25, 1.6] }}
            padding={1.85}
            startAngleDeg={24}
            endAngleDeg={-45}
            durationSec={15}
            elevationDeg={24}
            fov={42}
          />
        )}

        <Ground size={60} divisions={60} y={0} />
        <CurvedRail
          startZ={-10}
          curveStartZ={curveStartZ}
          curveRadius={curveRadius}
          curveLength={18}
          gauge={1.435}
          highlighted
          palette="blueprint-navy"
        />
        <WheelsetOnRail
          entityId="wheelset"
          role="focus"
          distance={distance.value}
          lateralShift={lateralShift}
          wheelRadius={0.46}
          gauge={1.435}
          coneRatio={0.05}
          taperExaggeration={4.5}
          curveStartZ={curveStartZ}
          curveRadius={curveRadius}
          highlightContact
          showEffectiveDiameter={sec >= 10}
          liftY={mutation === 'lift-wheel' ? 0.05 : 0}
          yawOffsetRad={mutation === 'rotate-axle' ? Math.PI / 2 : 0}
          palette="blueprint-navy"
        />

        {/* Inertia vector arrow during curve entry (Adegan B: 5-10s) */}
        {sec >= 5 && sec < 10 ? (
          <Arrow3D
            from={[layout.center[0], 1.28, layout.center[2]]}
            to={[layout.center[0], 1.28, layout.center[2] + 1.15]}
            radius={0.03}
            headRadius={0.09}
            headLength={0.24}
            palette="blueprint-navy"
          />
        ) : null}

        <ParallaxForeground distance={distance.value} zOffset={2.3} palette="blueprint-navy" />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const DemoKereta: React.FC<DemoKeretaProps> = (props) => (
  <TelemetryProvider enabled={props.telemetry}>
    <DemoKeretaInner {...props} />
  </TelemetryProvider>
);
