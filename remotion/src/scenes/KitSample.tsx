import React from 'react';
import {
  BLUEPRINT_TOKENS,
  BlueprintStage,
  Box,
  CameraRig,
  CaptionBar,
  Cylinder,
  Ground,
  TitleCard,
  Torus,
  crankAngleFromTime,
  solveCrankSlider,
  useSceneTime,
} from '../kit';

export const KitSample: React.FC = () => {
  const { sec } = useSceneTime();
  const angle = crankAngleFromTime(sec, 0, 3, 0.5, Math.PI * 0.25);
  const linkage = solveCrankSlider({
    crankAngleRad: angle,
    crankRadius: 0.45,
    rodLength: 1.45,
    crankCenter: [0, 1.0, 0],
  });

  return (
    <BlueprintStage
      cameraPosition={[2.2, 2.5, 5.2]}
      hud={
        <>
          <TitleCard
            tag="SCENE KIT // P1"
            title="Blueprint 3D Kit"
            subtitle="Verifikasi render kit di remotion/"
            position="top"
            startSec={0}
            durationSec={3}
          />
          <CaptionBar
            text="Scene Kit aktif di remotion/src/kit/"
            startSec={0}
            durationSec={3}
          />
        </>
      }
    >
      <CameraRig
        mode="orbit"
        framing="portrait-lower"
        target={[0, 2.0, 0]}
        radius={5.2}
        height={1.0}
        startAngleDeg={-15}
        endAngleDeg={15}
        startSec={0}
        durationSec={3}
      />
      <Ground size={30} divisions={30} />
      <Cylinder
        radiusTop={0.14}
        radiusBottom={0.14}
        height={0.9}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 1.0, 0]}
        color={BLUEPRINT_TOKENS.colors.steel}
      />
      <Cylinder
        radiusTop={0.07}
        radiusBottom={0.08}
        height={1.45}
        position={linkage.rodCenter}
        rotation={[0, 0, linkage.rodRotationZ]}
        color={BLUEPRINT_TOKENS.colors.cyan}
      />
      <Cylinder
        radiusTop={0.5}
        radiusBottom={0.5}
        height={0.5}
        position={linkage.pistonPin}
        color={BLUEPRINT_TOKENS.colors.steelLight}
      />
      <Torus
        radius={0.52}
        tube={0.025}
        rotation={[Math.PI / 2, 0, 0]}
        position={[linkage.pistonPin[0], linkage.pistonPin[1] + 0.14, linkage.pistonPin[2]]}
        color={BLUEPRINT_TOKENS.colors.yellow}
      />
      <Box
        size={[1.4, 1.6, 1.3]}
        position={[0, 2.5, 0]}
        cutaway
        color={BLUEPRINT_TOKENS.colors.cyan}
      />
    </BlueprintStage>
  );
};
