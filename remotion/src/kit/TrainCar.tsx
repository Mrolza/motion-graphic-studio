import React from 'react';
import { BLUEPRINT_TOKENS } from './tokens';
import { EasingMode, translatePath, useSceneTime } from './motion';
import { Axle } from './Primitives3D';

export interface TrainCarProps {
  position?: [number, number, number];
  from?: [number, number, number];
  to?: [number, number, number];
  easing?: EasingMode;
  gauge?: number;
  spinRps?: number;
  length?: number;
  startSec?: number;
  durationSec?: number;
}

export const TrainCar: React.FC<TrainCarProps> = ({
  position = [0, 0, 0],
  from,
  to,
  easing = 'easeInOut',
  gauge = 1.435,
  spinRps = 2.0,
  length = 5.6,
  startSec = 0,
  durationSec = 6,
}) => {
  const { sec } = useSceneTime();
  const currentPos: [number, number, number] =
    from && to ? translatePath(sec, startSec, durationSec, from, to, easing) : position;

  const halfLen = length / 2;

  return (
    <group position={currentPos}>
      {/* Front and rear bogie axles */}
      <Axle
        gauge={gauge}
        position={[0, 0.63, halfLen - 1.1]}
        spinRps={spinRps}
        startSec={startSec}
        durationSec={durationSec}
      />
      <Axle
        gauge={gauge}
        position={[0, 0.63, -(halfLen - 1.1)]}
        spinRps={spinRps}
        startSec={startSec}
        durationSec={durationSec}
      />

      {/* Chassis frame */}
      <mesh position={[0, 1.02, 0]}>
        <boxGeometry args={[1.95, 0.22, length]} />
        <meshStandardMaterial
          color={BLUEPRINT_TOKENS.colors.steelDark}
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>

      {/* Main low-poly body */}
      <mesh position={[0, 1.85, -0.15]}>
        <boxGeometry args={[1.9, 1.45, length - 0.5]} />
        <meshStandardMaterial
          color="#132d52"
          emissive="#1e40af"
          emissiveIntensity={0.22}
          metalness={0.35}
          roughness={0.5}
        />
      </mesh>

      {/* Sloped nose */}
      <mesh position={[0, 1.62, halfLen - 0.1]} rotation={[-0.38, 0, 0]}>
        <boxGeometry args={[1.82, 1.05, 0.85]} />
        <meshStandardMaterial
          color="#173763"
          emissive={BLUEPRINT_TOKENS.colors.cyan}
          emissiveIntensity={0.18}
          metalness={0.4}
          roughness={0.45}
        />
      </mesh>

      {/* Blueprint cyan trim stripe along sides */}
      {[-0.96, 0.96].map((x, idx) => (
        <mesh key={idx} position={[x, 1.45, -0.15]}>
          <boxGeometry args={[0.03, 0.1, length - 0.4]} />
          <meshStandardMaterial
            color={BLUEPRINT_TOKENS.colors.cyan}
            emissive={BLUEPRINT_TOKENS.colors.cyan}
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}

      {/* Windows */}
      {[-1.4, -0.45, 0.5, 1.45].map((zOff, idx) => (
        <mesh key={idx} position={[0, 1.98, zOff]}>
          <boxGeometry args={[1.94, 0.44, 0.62]} />
          <meshStandardMaterial
            color={BLUEPRINT_TOKENS.colors.cyanGlow}
            emissive={BLUEPRINT_TOKENS.colors.cyan}
            emissiveIntensity={0.45}
            roughness={0.2}
          />
        </mesh>
      ))}

      {/* Headlight */}
      <mesh position={[0, 1.32, halfLen + 0.25]}>
        <boxGeometry args={[0.7, 0.16, 0.08]} />
        <meshStandardMaterial
          color={BLUEPRINT_TOKENS.colors.yellow}
          emissive={BLUEPRINT_TOKENS.colors.yellow}
          emissiveIntensity={1.2}
        />
      </mesh>
    </group>
  );
};
