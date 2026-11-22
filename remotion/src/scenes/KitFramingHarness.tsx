import React from 'react';
import {
  BlueprintStage,
  CameraRig,
  CurvedRail,
  EngineBlock,
  ExaggerationBadge,
  Ground,
  HudLayout,
  PistonCrankAssembly,
  RailCrossSection,
  Suspension,
  TelemetryProvider,
  TrainCar,
  WheelsetOnRail,
  computeWheelsetLayout,
} from '../kit';

export type KitAssemblyKind =
  | 'TrainCar'
  | 'WheelsetOnRail'
  | 'RailCrossSection'
  | 'EngineBlock'
  | 'PistonCrankAssembly'
  | 'Suspension';

export interface KitFramingHarnessProps {
  telemetry?: boolean;
  assembly?: KitAssemblyKind;
  driverValue?: number;
}

export const KitFramingHarness: React.FC<KitFramingHarnessProps> = ({
  telemetry = false,
  assembly = 'TrainCar',
  driverValue = 0,
}) => (
  <TelemetryProvider enabled={telemetry}>
    <KitFramingInner telemetry={telemetry} assembly={assembly} driverValue={driverValue} />
  </TelemetryProvider>
);

const KitFramingInner: React.FC<Required<KitFramingHarnessProps>> = ({
  telemetry,
  assembly,
  driverValue,
}) => {
  const wl = computeWheelsetLayout({ distance: driverValue, curveStartZ: 2, curveRadius: 10 });

  const renderFocus = () => {
    switch (assembly) {
      case 'TrainCar':
        return (
          <>
            <CameraRig
              mode="frameEntities"
              focusBox={{ center: wl.center, size: [2.2, 2.0, 4.4] }}
              padding={1.25}
              startAngleDeg={-22}
              endAngleDeg={-22}
              elevationDeg={18}
            />
            <CurvedRail startZ={-10} curveStartZ={2} curveRadius={10} curveLength={18} gauge={1.435} highlighted palette="blueprint-navy" />
            <TrainCar entityId="focus_entity" distance={driverValue} curveStartZ={2} curveRadius={10} palette="blueprint-navy" />
          </>
        );
      case 'WheelsetOnRail':
        return (
          <>
            <CameraRig
              mode="frameEntities"
              focusBox={{ center: wl.center, size: [1.9, 1.25, 1.6] }}
              padding={1.25}
              startAngleDeg={-25}
              endAngleDeg={-25}
              elevationDeg={22}
            />
            <CurvedRail startZ={-10} curveStartZ={2} curveRadius={10} curveLength={18} gauge={1.435} highlighted palette="blueprint-navy" />
            <WheelsetOnRail entityId="focus_entity" distance={driverValue} taperExaggeration={4.5} curveStartZ={2} curveRadius={10} highlightContact palette="blueprint-navy" />
          </>
        );
      case 'RailCrossSection':
        return (
          <>
            <CameraRig
              mode="frameEntities"
              focusBox={{ center: [0, 0.55, 0], size: [1.9, 1.15, 0.35] }}
              padding={1.15}
              startAngleDeg={0}
              endAngleDeg={0}
              elevationDeg={2}
            />
            <RailCrossSection entityId="focus_entity" view="section" lateralShift={driverValue} taperExaggeration={12} palette="blueprint-navy" />
          </>
        );
      case 'EngineBlock':
        return (
          <>
            <CameraRig
              mode="frameEntities"
              focusBox={{ center: [0, 1.72, 0], size: [2.05, 3.15, 2.05] }}
              padding={1.25}
              startAngleDeg={-28}
              endAngleDeg={-28}
              elevationDeg={18}
            />
            <EngineBlock entityId="focus_entity" crankAngleDeg={driverValue} cutawayProgress={0.5} position={[0, 0.45, 0]} palette="blueprint-navy" />
          </>
        );
      case 'PistonCrankAssembly':
        return (
          <>
            <CameraRig
              mode="frameEntities"
              focusBox={{ center: [0, 1.72, 0], size: [1.35, 3.15, 1.35] }}
              padding={1.22}
              startAngleDeg={-24}
              endAngleDeg={-24}
              elevationDeg={12}
            />
            <PistonCrankAssembly entityId="focus_entity" crankAngleDeg={driverValue} position={[0, 0.45, 0]} cutaway palette="blueprint-navy" />
          </>
        );
      case 'Suspension':
        return (
          <>
            <CameraRig
              mode="frameEntities"
              focusBox={{ center: [0, 0.55, 0], size: [0.55, 1.0, 0.55] }}
              padding={1.08}
              startAngleDeg={-20}
              endAngleDeg={-20}
              elevationDeg={15}
            />
            <Suspension entityId="focus_entity" position={[0, 0.1, 0]} phaseRad={driverValue} palette="blueprint-navy" />
          </>
        );
    }
  };

  return (
    <BlueprintStage
      palette="blueprint-navy"
      telemetry={telemetry}
      hud={
        <HudLayout palette="blueprint-navy">
          {assembly === 'RailCrossSection' ? <ExaggerationBadge factor={12} palette="blueprint-navy" /> : null}
        </HudLayout>
      }
    >
      <Ground size={40} divisions={40} y={-0.1} />
      {renderFocus()}
    </BlueprintStage>
  );
};
