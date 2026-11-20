import React from 'react';
import {
  BlueprintStage,
  CameraRig,
  EffectiveDiameterCompare,
  ExaggerationBadge,
  Ground,
  HudLayout,
  HudZone,
  KineticTitle,
  RailCrossSection,
  TelemetryProvider,
  useDriver,
} from '../kit';

export const DemoCrossSection: React.FC<{ telemetry?: boolean }> = ({ telemetry = false }) => (
  <TelemetryProvider enabled={telemetry}>
    <DemoCrossSectionInner telemetry={telemetry} />
  </TelemetryProvider>
);

const DemoCrossSectionInner: React.FC<{ telemetry: boolean }> = ({ telemetry }) => {
  const shift = useDriver({
    name: 'lateral_shift',
    from: -0.06,
    to: 0.06,
    unit: 'm',
    startSec: 0,
    durationSec: 3,
    curve: 'linear',
  });

  return (
    <BlueprintStage
      palette="blueprint-navy"
      telemetry={telemetry}
      hud={
        <HudLayout palette="blueprint-navy">
          <HudZone zone="title" palette="blueprint-navy">
            <KineticTitle
              id="cs_title"
              title="Penampang Roda Kerucut"
              subtitle="Titik kontak bergeser & diameter efektif"
              palette="blueprint-navy"
            />
          </HudZone>
          <ExaggerationBadge factor={12} palette="blueprint-navy" />
          <HudZone zone="callout" palette="blueprint-navy">
            <EffectiveDiameterCompare
              id="cs_compare"
              lateralShift={shift.value}
              maxShift={0.06}
              zone="callout"
              palette="blueprint-navy"
            />
          </HudZone>
        </HudLayout>
      }
    >
      <CameraRig
        mode="frameEntities"
        focusBox={{ center: [0, 0.55, 0], size: [1.9, 1.15, 0.35] }}
        padding={1.15}
        startAngleDeg={0}
        endAngleDeg={0}
        elevationDeg={2}
      />
      <Ground size={40} divisions={40} y={0} />
      <RailCrossSection
        entityId="rail_cross_section"
        view="section"
        lateralShift={shift.value}
        taperExaggeration={12}
        palette="blueprint-navy"
      />
    </BlueprintStage>
  );
};
