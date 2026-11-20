import React from 'react';
import {
  BlueprintStage,
  Callout,
  CameraRig,
  Ground,
  HudLayout,
  HudZone,
  KineticTitle,
  MeasureReveal,
  ParallaxForeground,
  Rail,
  SceneTransition,
  StatCounter,
  Suspension,
  TelemetryProvider,
  useDriver,
  useSceneTime,
  WheelsetOnRail,
} from '../kit';

export interface DemoKeretaProps {
  telemetry?: boolean;
  mutation?: 'framing' | 'hud-overlap' | 'hud-format';
}

const DemoKeretaHud: React.FC<{
  distance: ReturnType<typeof useDriver>;
  mutation?: DemoKeretaProps['mutation'];
}> = ({ distance, mutation }) => {
  const gaugeText = mutation === 'hud-format' ? 'Lebar rel 1,435 mm' : 'Lebar rel 1.435 mm';

  return (
    <HudLayout palette="blueprint-navy">
      <HudZone zone="title" palette="blueprint-navy">
        <KineticTitle
          id="title_kereta"
          title="Roda Kerucut 1:20"
          subtitle="Mengapa kereta tidak tergelincir di tikungan?"
          palette="blueprint-navy"
        />
      </HudZone>

      <HudZone zone="callout" palette="blueprint-navy">
        <MeasureReveal
          id="measure_taper"
          label="Kemiringan Tapak Roda"
          valueText="1:20"
          startSec={0.5}
          durationSec={0.9}
          palette="blueprint-navy"
        />
        <StatCounter
          id="stat_distance"
          label="Jarak Tempuh"
          driver={distance}
          bindToDriver
          decimals={1}
          palette="blueprint-navy"
        />
        {mutation !== 'hud-overlap' ? (
          <Callout
            id="callout_wheel"
            label="Kontak Tapak Kerucut"
            detail={gaugeText}
            palette="blueprint-navy"
          />
        ) : null}
      </HudZone>
      {mutation === 'hud-overlap' ? (
        <Callout
          id="callout_wheel"
          label="Kontak Tapak Kerucut"
          detail={gaugeText}
          screenAnchor={[48, 900]}
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
    from: -3.2,
    to: 3.2,
    unit: 'm',
    startSec: 0,
    durationSec: 12,
    curve: 'linear',
  });

  const lateralShift = Math.sin(sec * 1.1) * 0.08;
  const springPhase = sec * 4.5;

  const hud = <DemoKeretaHud distance={distance} mutation={mutation} />;

  return (
    <SceneTransition variant="wipe-grid" durationSec={0.35} palette="blueprint-navy">
      <BlueprintStage palette="blueprint-navy" telemetry={telemetry} hud={hud}>
        {mutation === 'framing' ? (
          <CameraRig
            mode="dolly"
            from={[distance.value + 4.5, 1.5, 1.8]}
            to={[distance.value + 4.5, 1.5, 1.8]}
            target={[distance.value + 4.5, 0.7, 0]}
            fov={42}
          />
        ) : (
          <CameraRig
            mode="frameEntities"
            framing="portrait-lower"
            focusBox={{ center: [distance.value, 0.65, 0], size: [1.5, 1.35, 1.9] }}
            padding={1.7}
            startAngleDeg={-28}
            endAngleDeg={24}
            durationSec={12}
            elevationDeg={20}
            fov={42}
          />
        )}

        <Ground size={50} divisions={50} y={0} />
        <Rail length={36} gauge={1.435} position={[0, 0, 0]} highlighted />
        <WheelsetOnRail
          entityId="wheelset"
          role="focus"
          distance={distance.value}
          lateralShift={lateralShift}
          wheelRadius={0.46}
          gauge={1.435}
          coneRatio={0.05}
          highlightContact
          palette="blueprint-navy"
        />
        <Suspension
          entityId="suspension_left"
          role="prop"
          position={[distance.value, 0.68, -0.7175]}
          phaseRad={springPhase}
          restLength={0.42}
          amplitude={0.05}
          palette="blueprint-navy"
        />
        <ParallaxForeground distance={distance.value} palette="blueprint-navy" />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const DemoKereta: React.FC<DemoKeretaProps> = (props) => (
  <TelemetryProvider enabled={props.telemetry}>
    <DemoKeretaInner {...props} />
  </TelemetryProvider>
);
