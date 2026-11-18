import React from 'react';
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
  getLocalProgress,
  crankAngleFromTime,
  solveCrankSlider,
  BLUEPRINT_TOKENS,
} from '@kit';

export const Scene4_CycleSummary: React.FC = () => {
  const { sec } = useSceneTime();
  const durationSec = 6;

  // rps = 1/3 over 6 seconds gives 2 full 720-degree cycles (0 to 4*PI)
  const rps = 1/3;
  const crankAngleRad = crankAngleFromTime(sec, 0, durationSec, rps, 0);
  const crankDeg = (crankAngleRad * 180) / Math.PI;
  const modDeg = crankDeg % 720;

  // Crank-slider linkage geometry
  const crankCenter: [number, number, number] = [0, 1.0, 0];
  const crankRadius = 0.45;
  const rodLength = 1.45;

  const linkage = solveCrankSlider({
    crankAngleRad,
    crankRadius,
    rodLength,
    crankCenter,
  });

  const crankRotationZ = linkage.crankRotationZ;
  const rodRotationZ = linkage.rodRotationZ;
  const crankPin = linkage.crankPin;
  const pistonPin = linkage.pistonPin;
  const rodCenter = linkage.rodCenter;

  // Valve Timing logic (0 to 720 degrees over the cycle)
  // Intake: 0 - 180 deg
  const intakeOpen = modDeg >= 0 && modDeg <= 180;
  const intakeOffset = intakeOpen ? 0.22 : 0;

  // Exhaust: 540 - 720 deg
  const exhaustOpen = modDeg >= 540 && modDeg <= 720;
  const exhaustOffset = exhaustOpen ? 0.22 : 0;

  // Spark near 360 deg (Compression TDC)
  const sparkActive = modDeg >= 345 && modDeg <= 385;
  const sparkIntensity = sparkActive ? 1.0 : 0.1;

  return (
    <BlueprintStage
      cameraPosition={[0, 3, 5.5]}
      fov={42}
      hud={
        <>
          <TitleCard
            tag="RINGKASAN SIKLUS"
            title="4 Langkah = 1 Siklus Daya"
            subtitle="Prinsip Kerja Mesin Pembakaran Dalam"
            position="top"
            startSec={0}
            durationSec={durationSec}
          />
          <StatCounter
            label="Putaran Mesin"
            from={1000}
            to={6000}
            unit="RPM"
            decimals={0}
            position="top-right"
            startSec={0}
            durationSec={durationSec}
          />
          <Callout
            title="ENGKOL-BATANG"
            body="Mengubah gerak naik-turun piston menjadi putaran poros."
            targetX={360}
            targetY={760}
            boxX={200}
            boxY={560}
            startSec={0.5}
            durationSec={durationSec - 0.5}
          />
          <CaptionBar
            text="Siklus 4 tak berulang ribuan kali per menit untuk menghasilkan tenaga."
            startSec={0.2}
            durationSec={durationSec - 0.2}
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
        radius={5.5}
        height={1.3}
        startAngleDeg={15}
        endAngleDeg={-20}
      />

      <Ground size={40} divisions={40} />
      <Grid size={40} divisions={40} />

      {/* Engine Crankcase & Crankshaft Assembly */}
      <Group position={[0, 0, 0]}>
        {/* Crankcase Shell Cutaway */}
        <Box
          size={[1.8, 1.4, 1.6]}
          position={[0, 1.0, 0]}
          cutaway={true}
          color={BLUEPRINT_TOKENS.colors.steelDark}
        />

        {/* Crankshaft Main Journal */}
        <Cylinder
          radiusTop={0.14}
          radiusBottom={0.14}
          height={1.1}
          rotation={[Math.PI / 2, 0, 0]}
          position={crankCenter}
          color={BLUEPRINT_TOKENS.colors.steelLight}
        />

        {/* Crank Throw Arm */}
        <Group position={crankCenter} rotation={[0, 0, crankRotationZ]}>
          <Box size={[0.24, 0.55, 0.16]} position={[0, 0.22, 0]} color={BLUEPRINT_TOKENS.colors.steel} />
        </Group>

        {/* Crankpin */}
        <Cylinder
          radiusTop={0.09}
          radiusBottom={0.09}
          height={0.35}
          rotation={[Math.PI / 2, 0, 0]}
          position={crankPin}
          color={BLUEPRINT_TOKENS.colors.yellow}
        />

        {/* Connecting Rod */}
        <Cylinder
          radiusTop={0.06}
          radiusBottom={0.08}
          height={rodLength}
          position={rodCenter}
          rotation={[0, 0, rodRotationZ]}
          color={BLUEPRINT_TOKENS.colors.cyan}
        />

        {/* Piston */}
        <Group position={pistonPin}>
          <Cylinder
            radiusTop={0.52}
            radiusBottom={0.52}
            height={0.52}
            color={BLUEPRINT_TOKENS.colors.steelLight}
          />
          <Torus
            radius={0.53}
            tube={0.025}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0.16, 0]}
            color={BLUEPRINT_TOKENS.colors.yellow}
          />
        </Group>

        {/* Cylinder Liner (Cutaway open front) */}
        <Cylinder
          radiusTop={0.58}
          radiusBottom={0.58}
          height={1.65}
          openEnded={true}
          thetaStart={Math.PI * 0.35}
          thetaLength={Math.PI * 1.3}
          position={[0, 2.55, 0]}
          color={BLUEPRINT_TOKENS.colors.cyan}
          emissive={BLUEPRINT_TOKENS.colors.cyan}
          emissiveIntensity={0.2}
        />

        {/* Outer Block Cutaway */}
        <Box
          size={[1.5, 1.75, 1.4]}
          position={[0, 2.55, 0]}
          cutaway={true}
          color={BLUEPRINT_TOKENS.colors.cyan}
        />

        {/* Cylinder Head */}
        <Box
          size={[1.6, 0.35, 1.45]}
          position={[0, 3.55, 0]}
          cutaway={true}
          color={BLUEPRINT_TOKENS.colors.steel}
        />

        {/* Intake Valve (Left) */}
        <Group position={[-0.26, 3.55 - intakeOffset, 0]}>
          <Cylinder
            radiusTop={0.035}
            radiusBottom={0.035}
            height={0.65}
            position={[0, 0, 0]}
            color={BLUEPRINT_TOKENS.colors.steelLight}
          />
          <Cone
            radius={0.14}
            height={0.1}
            position={[0, -0.33, 0]}
            color={BLUEPRINT_TOKENS.colors.steelLight}
          />
        </Group>

        {/* Exhaust Valve (Right) */}
        <Group position={[0.26, 3.55 - exhaustOffset, 0]}>
          <Cylinder
            radiusTop={0.035}
            radiusBottom={0.035}
            height={0.65}
            position={[0, 0, 0]}
            color={BLUEPRINT_TOKENS.colors.steelLight}
          />
          <Cone
            radius={0.14}
            height={0.1}
            position={[0, -0.33, 0]}
            color={BLUEPRINT_TOKENS.colors.steelLight}
          />
        </Group>

        {/* Spark Plug & Ignition Flash */}
        <Cylinder
          radiusTop={0.05}
          radiusBottom={0.05}
          height={0.45}
          position={[0, 3.65, 0]}
          color={BLUEPRINT_TOKENS.colors.white}
        />
        <Sphere
          radius={0.14}
          position={[0, 3.28, 0]}
          color={BLUEPRINT_TOKENS.colors.yellow}
          emissive={BLUEPRINT_TOKENS.colors.yellow}
          emissiveIntensity={sparkIntensity}
        />
      </Group>
    </BlueprintStage>
  );
};
