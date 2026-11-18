import React from 'react';
import {
  BlueprintStage, CameraRig, Ground, Grid, Group, Box, Cylinder,
  Sphere, Torus, Cone, TitleCard, StatCounter, Callout, CaptionBar,
  BLUEPRINT_TOKENS, useSceneTime, getLocalProgress, crankAngleFromTime,
  solveCrankSlider
} from '@kit';

export const Scene2_IntakeCompression: React.FC = () => {
  const { sec } = useSceneTime();
  const durationSec = 6;
  const startSec = 0;

  const crankAngleRad = crankAngleFromTime(sec, startSec, durationSec, 1 / 3, 0);
  const crankCenter = [0, 1.0, 0] as [number, number, number];
  const linkage = solveCrankSlider({ crankAngleRad, crankRadius: 0.45, rodLength: 1.45, crankCenter });
  const crankRotationZ = -crankAngleRad;

  const intakeProgress = getLocalProgress(sec, 0, 3);
  const intakeOpenOffset = crankAngleRad <= Math.PI + 0.1 ? 0.22 * Math.sin(intakeProgress * Math.PI) : 0;
  const mistOpacity = crankAngleRad <= Math.PI ? 0.35 + 0.35 * Math.sin(intakeProgress * Math.PI) : Math.max(0, 0.7 * (1 - (crankAngleRad - Math.PI) / Math.PI));

  return (
    <BlueprintStage
      cameraPosition={[1.8, 2.6, 4.8]}
      fov={42}
      hud={
        <>
          <TitleCard tag="LANGKAH 1 & 2" title="Hisap & Kompresi" subtitle="0° - 360° Siklus" position="top" startSec={startSec} durationSec={durationSec} />
          <StatCounter label="Sudut Engkol" from={0} to={360} unit="°" decimals={0} position="top-right" startSec={startSec} durationSec={durationSec} />
          <Callout title="KATUP HISAP" body="Terbuka saat piston turun (0°–180°)." targetX={325} targetY={540} boxX={195} boxY={400} startSec={0.5} durationSec={5} />
          <CaptionBar text="Hisap memasukkan campuran udara-bahan bakar, lalu kompresi memadatkannya." startSec={0.2} durationSec={5.6} />
        </>
      }
    >
      <CameraRig mode="dolly" framing="portrait-lower" startSec={startSec} durationSec={durationSec} from={[1.8, 2.6, 4.8]} to={[1, 2.5, 4]} target={[0, 2.3, 0]} radius={6} height={2.5} startAngleDeg={-25} endAngleDeg={25} />
      <Ground size={40} divisions={40} />
      <Grid size={40} divisions={40} />

      <Cylinder radiusTop={0.14} radiusBottom={0.14} height={0.9} rotation={[Math.PI / 2, 0, 0]} position={crankCenter} color={BLUEPRINT_TOKENS.colors.steel} />
      <Group position={crankCenter} rotation={[0, 0, crankRotationZ]}>
        <Box size={[0.24, 0.55, 0.16]} position={[0, 0.22, 0]} color={BLUEPRINT_TOKENS.colors.steelDark} />
      </Group>
      <Cylinder radiusTop={0.09} radiusBottom={0.09} height={0.35} rotation={[Math.PI / 2, 0, 0]} position={linkage.crankPin} color={BLUEPRINT_TOKENS.colors.yellow} />
      <Cylinder radiusTop={0.06} radiusBottom={0.08} height={1.45} position={linkage.rodCenter} rotation={[0, 0, linkage.rodRotationZ]} color={BLUEPRINT_TOKENS.colors.cyan} />

      <Group position={linkage.pistonPin}>
        <Cylinder radiusTop={0.52} radiusBottom={0.52} height={0.52} color={BLUEPRINT_TOKENS.colors.steelLight} />
        <Torus radius={0.53} tube={0.025} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.16, 0]} color={BLUEPRINT_TOKENS.colors.yellow} />
      </Group>

      <Cylinder radiusTop={0.5} radiusBottom={0.5} height={1.1} position={[0, 2.75, 0]} color={BLUEPRINT_TOKENS.colors.cyan} emissive={BLUEPRINT_TOKENS.colors.cyan} emissiveIntensity={0.6} opacity={mistOpacity} />
      <Cylinder radiusTop={0.58} radiusBottom={0.58} height={1.65} openEnded={true} thetaStart={Math.PI * 0.35} thetaLength={Math.PI * 1.3} position={[0, 2.55, 0]} color={BLUEPRINT_TOKENS.colors.cyan} emissive={BLUEPRINT_TOKENS.colors.cyan} emissiveIntensity={0.2} />
      <Box size={[1.5, 1.75, 1.4]} position={[0, 2.55, 0]} cutaway={true} color={BLUEPRINT_TOKENS.colors.cyan} />
      <Box size={[1.6, 0.35, 1.45]} position={[0, 3.55, 0]} cutaway={true} color={BLUEPRINT_TOKENS.colors.steel} />

      <Group position={[-0.26, 3.55, 0]}>
        <Cylinder radiusTop={0.035} radiusBottom={0.035} height={0.65} position={[0, -0.32 - intakeOpenOffset, 0]} color={BLUEPRINT_TOKENS.colors.cyan} emissive={BLUEPRINT_TOKENS.colors.cyan} emissiveIntensity={0.5} />
        <Cone radius={0.14} height={0.1} position={[0, -0.65 - intakeOpenOffset, 0]} color={BLUEPRINT_TOKENS.colors.cyan} />
      </Group>

      <Group position={[0.26, 3.55, 0]}>
        <Cylinder radiusTop={0.035} radiusBottom={0.035} height={0.65} position={[0, -0.32, 0]} color={BLUEPRINT_TOKENS.colors.steel} />
        <Cone radius={0.14} height={0.1} position={[0, -0.65, 0]} color={BLUEPRINT_TOKENS.colors.steel} />
      </Group>

      <Cylinder radiusTop={0.05} radiusBottom={0.05} height={0.45} position={[0, 3.65, 0]} color={BLUEPRINT_TOKENS.colors.white} />
      <Sphere radius={0.07} position={[0, 3.35, 0]} color={BLUEPRINT_TOKENS.colors.white} />
    </BlueprintStage>
  );
};
