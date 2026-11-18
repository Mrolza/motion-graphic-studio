import React from "react";
import {
  BlueprintStage,
  CameraRig,
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
  useSceneTime,
  crankAngleFromTime,
  solveCrankSlider,
  BLUEPRINT_TOKENS
} from "@kit";

export const Scene1_EngineCutaway: React.FC = () => {
  const { sec } = useSceneTime();
  const durationSec = 6;
  const rps = 0.35;
  
  const crankAngleRad = crankAngleFromTime(sec, 0, durationSec, rps, 0);
  const crankDeg = Math.round((crankAngleRad * 180) / Math.PI);

  const crankCenter: [number, number, number] = [0, 1.0, 0];
  const crankRadius = 0.45;
  const rodLength = 1.45;

  const linkage = solveCrankSlider({ crankAngleRad, crankRadius, rodLength, crankCenter });
  const cycleDegMod = crankDeg % 720;
  
  const intakeOpenOffset = (cycleDegMod >= 0 && cycleDegMod <= 180) ? 0.22 : 0;
  const exhaustOpenOffset = (cycleDegMod >= 540 && cycleDegMod <= 720) ? 0.22 : 0;
  const sparkIntensity = (cycleDegMod >= 345 && cycleDegMod <= 375) ? 1.5 : 0.1;

  return (
    <BlueprintStage
      cameraPosition={[0, 2.5, 5.4]}
      fov={42}
      hud={
        <>
          <TitleCard
            tag="BLUEPRINT // 01"
            title="Bagaimana Mesin 4 Tak Bekerja?"
            subtitle="4 langkah, 2 putaran engkol (720°)"
            position="top"
            startSec={0}
            durationSec={durationSec}
          />
          <StatCounter
            label="Siklus Engkol"
            from={0}
            to={756}
            unit="°"
            decimals={0}
            position="top-right"
            startSec={0}
            durationSec={durationSec}
          />
          <Callout
            title="Ruang Bakar & Piston"
            body="Mengubah energi pembakaran menjadi gerakan mekanis linier."
            targetX={360}
            targetY={600}
            boxX={480}
            boxY={440}
            startSec={0.8}
            durationSec={4.8}
          />
          <CaptionBar
            text="Satu siklus 4 tak terdiri dari langkah hisap, kompresi, usaha, dan buang."
            startSec={0.2}
            durationSec={5.6}
          />
        </>
      }
    >
      <CameraRig
        mode="orbit"
        framing="portrait-lower"
        startSec={0}
        durationSec={durationSec}
        target={[0, 2.1, 0]}
        radius={5.4}
        height={1.1}
        startAngleDeg={-22}
        endAngleDeg={18}
      />

      <Ground size={40} divisions={40} />
      <Grid size={40} divisions={40} />

      <Box size={[1.6, 1.2, 1.4]} position={[0, 1.0, 0]} cutaway={true} color={BLUEPRINT_TOKENS.colors.steelDark} opacity={0.85} />
      <Cylinder radiusTop={0.14} radiusBottom={0.14} height={0.9} rotation={[Math.PI / 2, 0, 0]} position={crankCenter} color={BLUEPRINT_TOKENS.colors.steelLight} />

      <Group position={crankCenter} rotation={[0, 0, linkage.crankRotationZ]}>
        <Box size={[0.24, 0.55, 0.16]} position={[0, 0.22, 0]} color={BLUEPRINT_TOKENS.colors.steel} />
        <Cylinder radiusTop={0.09} radiusBottom={0.09} height={0.35} rotation={[Math.PI / 2, 0, 0]} position={[0, crankRadius, 0]} color={BLUEPRINT_TOKENS.colors.yellow} emissive={BLUEPRINT_TOKENS.colors.yellow} emissiveIntensity={0.3} />
      </Group>

      <Cylinder radiusTop={0.06} radiusBottom={0.08} height={rodLength} position={linkage.rodCenter} rotation={[0, 0, linkage.rodRotationZ]} color={BLUEPRINT_TOKENS.colors.cyan} emissive={BLUEPRINT_TOKENS.colors.cyan} emissiveIntensity={0.2} />

      <Group position={linkage.pistonPin}>
        <Cylinder radiusTop={0.52} radiusBottom={0.52} height={0.52} color={BLUEPRINT_TOKENS.colors.steelLight} />
        <Torus radius={0.53} tube={0.025} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.16, 0]} color={BLUEPRINT_TOKENS.colors.yellow} />
        <Torus radius={0.53} tube={0.025} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} color={BLUEPRINT_TOKENS.colors.yellow} />
      </Group>

      <Cylinder radiusTop={0.58} radiusBottom={0.58} height={1.65} openEnded={true} thetaStart={Math.PI * 0.35} thetaLength={Math.PI * 1.3} position={[0, 2.55, 0]} color={BLUEPRINT_TOKENS.colors.cyan} emissive={BLUEPRINT_TOKENS.colors.cyan} emissiveIntensity={0.25} />
      <Box size={[1.5, 1.75, 1.4]} position={[0, 2.55, 0]} cutaway={true} color={BLUEPRINT_TOKENS.colors.cyan} opacity={0.35} />
      <Box size={[1.6, 0.35, 1.45]} position={[0, 3.55, 0]} cutaway={true} color={BLUEPRINT_TOKENS.colors.steel} />

      <Group position={[-0.26, 3.55 - intakeOpenOffset, 0]}>
        <Cylinder radiusTop={0.035} radiusBottom={0.035} height={0.65} color={BLUEPRINT_TOKENS.colors.steelLight} />
        <Cone radius={0.14} height={0.1} position={[0, -0.32, 0]} color={BLUEPRINT_TOKENS.colors.cyan} emissive={BLUEPRINT_TOKENS.colors.cyan} emissiveIntensity={0.4} />
      </Group>

      <Group position={[0.26, 3.55 - exhaustOpenOffset, 0]}>
        <Cylinder radiusTop={0.035} radiusBottom={0.035} height={0.65} color={BLUEPRINT_TOKENS.colors.steelLight} />
        <Cone radius={0.14} height={0.1} position={[0, -0.32, 0]} color={BLUEPRINT_TOKENS.colors.coral} emissive={BLUEPRINT_TOKENS.colors.coral} emissiveIntensity={0.4} />
      </Group>

      <Cylinder radiusTop={0.05} radiusBottom={0.05} height={0.45} position={[0, 3.65, 0]} color={BLUEPRINT_TOKENS.colors.white} />
      <Sphere radius={0.14} position={[0, 3.28, 0]} color={BLUEPRINT_TOKENS.colors.yellow} emissive={BLUEPRINT_TOKENS.colors.yellow} emissiveIntensity={sparkIntensity} />
    </BlueprintStage>
  );
};
