import React from "react";
import {
  BlueprintStage,
  CameraRig,
  useSceneTime,
  getLocalProgress,
  crankAngleFromTime,
  solveCrankSlider,
  BLUEPRINT_TOKENS,
  Ground,
  Grid,
  Group,
  Box,
  Cylinder,
  Sphere,
  Torus,
  Cone,
  TitleCard,
  StatCounter,
  Callout,
  CaptionBar,
} from "@kit";

export const Scene3_PowerExhaust: React.FC = () => {
  const { sec, durationSec } = useSceneTime();
  const crankAngleRad = crankAngleFromTime(sec, 0, durationSec, 0.285, Math.PI * 2);
  const progress = Math.min(1, Math.max(0, (crankAngleRad - Math.PI * 2) / (Math.PI * 2)));
  
  const linkage = solveCrankSlider({
    crankAngleRad,
    crankRadius: 0.45,
    rodLength: 1.45,
    crankCenter: [0, 1.0, 0],
  });

  const sparkIntensity = (() => {
    const p = getLocalProgress(sec, 0, 0.8);
    return p > 0 && p < 1 ? Math.sin(p * Math.PI) * 4.5 : 0;
  })();

  const exhaustOpenOffset = progress >= 0.5 ? getLocalProgress(sec, 3.5, 3.5) * 0.22 : 0;

  return (
    <BlueprintStage
      cameraPosition={[1.5, 2.7, 4.5]}
      fov={42}
      hud={
        <>
          <TitleCard tag="LANGKAH 3 & 4" title="Usaha & Buang" subtitle="Siklus Kerja 4-Tak" position="top" startSec={0} durationSec={durationSec} />
          <StatCounter label="Sudut Engkol" from={360} to={720} unit="°" decimals={0} position="top-right" startSec={0} durationSec={durationSec} />
          <Callout title="BUSI & KATUP BUANG" body="Percikan busi memicu langkah usaha; katup buang membuka di 540°–720°." targetX={385} targetY={540} boxX={510} boxY={400} startSec={0.5} durationSec={6.5} />
          <CaptionBar text="Ledakan pembakaran mendorong piston ke bawah, lalu gas sisa dibuang." startSec={0.2} durationSec={6.6} />
        </>
      }
    >
      <CameraRig mode="closeUp" framing="portrait-lower" startSec={0} durationSec={durationSec} from={[1.5, 2.7, 4.5]} to={[-1.2, 2.5, 4.1]} target={[0, 2.4, 0]} radius={5} height={2.5} startAngleDeg={-15} endAngleDeg={15} />

      <Ground size={40} divisions={40} />
      <Grid size={40} divisions={40} />

      <Group position={[0, 0, 0]}>
        <Cylinder radiusTop={0.14} radiusBottom={0.14} height={0.9} rotation={[Math.PI / 2, 0, 0]} position={[0, 1.0, 0]} color={BLUEPRINT_TOKENS.colors.steel} />
        <Group position={[0, 1.0, 0]} rotation={[0, 0, linkage.crankRotationZ]}>
          <Box size={[0.24, 0.55, 0.16]} position={[0, 0.22, 0]} color={BLUEPRINT_TOKENS.colors.steelDark} />
        </Group>
        <Cylinder radiusTop={0.09} radiusBottom={0.09} height={0.35} rotation={[Math.PI / 2, 0, 0]} position={linkage.crankPin} color={BLUEPRINT_TOKENS.colors.yellow} />
        <Cylinder radiusTop={0.06} radiusBottom={0.08} height={1.45} position={linkage.rodCenter} rotation={[0, 0, linkage.rodRotationZ]} color={BLUEPRINT_TOKENS.colors.cyan} />
        
        <Group position={linkage.pistonPin}>
          <Cylinder radiusTop={0.52} radiusBottom={0.52} height={0.52} color={BLUEPRINT_TOKENS.colors.steelLight} />
          <Torus radius={0.53} tube={0.025} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.16, 0]} color={BLUEPRINT_TOKENS.colors.yellow} />
        </Group>

        <Cylinder radiusTop={0.58} radiusBottom={0.58} height={1.65} openEnded={true} thetaStart={Math.PI * 0.35} thetaLength={Math.PI * 1.3} position={[0, 2.55, 0]} color={BLUEPRINT_TOKENS.colors.cyan} emissive={BLUEPRINT_TOKENS.colors.cyan} emissiveIntensity={0.2} opacity={0.85} />
        <Box size={[1.5, 1.75, 1.4]} position={[0, 2.55, 0]} cutaway={true} color={BLUEPRINT_TOKENS.colors.cyan} opacity={0.3} />
        <Box size={[1.6, 0.35, 1.45]} position={[0, 3.55, 0]} cutaway={true} color={BLUEPRINT_TOKENS.colors.steel} />

        <Group position={[-0.26, 3.55, 0]}>
          <Cylinder radiusTop={0.035} radiusBottom={0.035} height={0.65} color={BLUEPRINT_TOKENS.colors.steelLight} />
          <Cone radius={0.14} height={0.1} position={[0, -0.33, 0]} color={BLUEPRINT_TOKENS.colors.steelLight} />
        </Group>

        <Group position={[0.26, 3.55 - exhaustOpenOffset, 0]}>
          <Cylinder radiusTop={0.035} radiusBottom={0.035} height={0.65} color={BLUEPRINT_TOKENS.colors.coral} />
          <Cone radius={0.14} height={0.1} position={[0, -0.33, 0]} color={BLUEPRINT_TOKENS.colors.coral} />
        </Group>

        <Cylinder radiusTop={0.05} radiusBottom={0.05} height={0.45} position={[0, 3.65, 0]} color={BLUEPRINT_TOKENS.colors.white} />
        {sparkIntensity > 0 && (
          <Sphere radius={0.18} position={[0, 3.28, 0]} color={BLUEPRINT_TOKENS.colors.yellow} emissive={BLUEPRINT_TOKENS.colors.yellow} emissiveIntensity={sparkIntensity} />
        )}
      </Group>
    </BlueprintStage>
  );
};
