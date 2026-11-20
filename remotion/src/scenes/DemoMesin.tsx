import React from 'react';
import {
  BlueprintStage,
  Callout,
  CameraRig,
  Ground,
  HudLayout,
  HudZone,
  KineticTitle,
  ListReveal,
  PistonCrankAssembly,
  SceneTransition,
  StatCounter,
  TelemetryProvider,
  useDriver,
  useSceneTime,
  valveStateFromCrankAngle,
} from '../kit';

export interface DemoMesinProps {
  telemetry?: boolean;
  mutation?: 'time-valve' | 'hud-easing' | 'detach-rod' | 'occlude-crank';
}

const STROKE_LABELS = ['1. Hisap', '2. Kompresi', '3. Usaha', '4. Buang'];
const STROKE_INDEX: Record<'hisap' | 'kompresi' | 'usaha' | 'buang', number> = {
  hisap: 0,
  kompresi: 1,
  usaha: 2,
  buang: 3,
};

const DemoMesinHud: React.FC<{
  crank: ReturnType<typeof useDriver>;
  mutation?: DemoMesinProps['mutation'];
}> = ({ crank, mutation }) => {
  const valves = valveStateFromCrankAngle(crank.value);
  const activeIdx = STROKE_INDEX[valves.strokePhase];
  const valveSummary = `Hisap: ${valves.intakeOpen ? 'BUKA' : 'TUTUP'} · Buang: ${
    valves.exhaustOpen ? 'BUKA' : 'TUTUP'
  }${valves.sparkOn ? ' · BUSI MENYALA' : ''}`;

  return (
    <HudLayout palette="industrial-orange">
      <HudZone zone="title" palette="industrial-orange">
        <KineticTitle
          id="title_mesin"
          title="Siklus Mesin 4 Tak"
          subtitle={valveSummary}
          palette="industrial-orange"
        />
      </HudZone>

      <HudZone zone="callout" palette="industrial-orange">
        <ListReveal
          id="list_strokes"
          items={STROKE_LABELS}
          activeIndex={activeIdx}
          palette="industrial-orange"
        />
        <StatCounter
          id="stat_crank_angle"
          label="Sudut Engkol"
          driver={crank}
          bindToDriver={mutation !== 'hud-easing'}
          from={0}
          to={720}
          unit="°"
          durationSec={16}
          palette="industrial-orange"
        />
      </HudZone>

      {/* Occlusion mutation: deliberately place a Callout panel right over the crankshaft */}
      {mutation === 'occlude-crank' ? (
        <Callout
          id="callout_occlude_crank"
          label="Panel Menutupi Poros Engkol"
          detail="Simulasi pelanggaran visibilitas"
          screenAnchor={[160, 620]}
          palette="industrial-orange"
        />
      ) : null}
    </HudLayout>
  );
};

const DemoMesinInner: React.FC<DemoMesinProps> = ({
  telemetry = false,
  mutation,
}) => {
  const { sec } = useSceneTime();
  const crank = useDriver({
    name: 'crank_angle',
    from: 0,
    to: 720,
    unit: '°',
    startSec: 0,
    durationSec: 16,
    curve: 'linear',
  });

  const buggyTimeIntake = mutation === 'time-valve' ? sec >= 6 && sec <= 10 : undefined;
  const hud = <DemoMesinHud crank={crank} mutation={mutation} />;

  return (
    <SceneTransition variant="fade" durationSec={0.35} palette="industrial-orange">
      <BlueprintStage palette="industrial-orange" telemetry={telemetry} hud={hud}>
        <CameraRig
          mode="frameEntities"
          framing="portrait-lower"
          focusBox={{ center: [0, 1.65, 0], size: [1.5, 2.75, 1.5] }}
          padding={1.18}
          startAngleDeg={-16}
          endAngleDeg={16}
          durationSec={16}
          elevationDeg={10}
          fov={42}
        />
        <Ground size={36} divisions={36} y={-0.55} />
        <PistonCrankAssembly
          entityId="piston_crank"
          role="focus"
          crankAngleDeg={crank.value}
          position={[0, 0.45, 0]}
          cutaway
          overrideIntakeOpen={buggyTimeIntake}
          detachRodOffset={mutation === 'detach-rod' ? [0.45, 0.35, 0] : undefined}
          palette="industrial-orange"
        />
      </BlueprintStage>
    </SceneTransition>
  );
};

export const DemoMesin: React.FC<DemoMesinProps> = (props) => (
  <TelemetryProvider enabled={props.telemetry}>
    <DemoMesinInner {...props} />
  </TelemetryProvider>
);
