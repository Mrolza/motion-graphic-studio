import React, { useMemo } from 'react';
import * as THREE from 'three';
import { BLUEPRINT_TOKENS } from './tokens';
import { highlight, oscillate, spin, useSceneTime } from './motion';

export interface GroundProps {
  size?: number;
  divisions?: number;
  y?: number;
  startSec?: number;
  durationSec?: number;
}

export const Ground: React.FC<GroundProps> = ({
  size = 40,
  divisions = 40,
  y = 0,
}) => {
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial
          color={BLUEPRINT_TOKENS.colors.bgDeep}
          roughness={0.95}
          metalness={0.1}
        />
      </mesh>
      <gridHelper
        args={[
          size,
          divisions,
          BLUEPRINT_TOKENS.colors.cyan,
          BLUEPRINT_TOKENS.colors.gridSecondary,
        ]}
      />
    </group>
  );
};

export interface RailProps {
  length?: number;
  gauge?: number;
  position?: [number, number, number];
  highlighted?: boolean;
  startSec?: number;
  durationSec?: number;
}

export const Rail: React.FC<RailProps> = ({
  length = 24,
  gauge = 1.435,
  position = [0, 0, 0],
  highlighted = false,
  startSec = 0,
  durationSec = 10,
}) => {
  const { sec } = useSceneTime();
  const h = highlighted ? highlight(sec, startSec, durationSec) : 0;
  const halfGauge = gauge / 2;

  const sleeperCount = Math.floor(length / 0.7);
  const sleepers = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < sleeperCount; i++) {
      arr.push(-length / 2 + 0.35 + i * 0.7);
    }
    return arr;
  }, [length, sleeperCount]);

  const railColor = highlighted ? BLUEPRINT_TOKENS.colors.yellow : BLUEPRINT_TOKENS.colors.cyan;

  return (
    <group position={position}>
      {/* Left & Right Steel Rails along Z axis */}
      {[-halfGauge, halfGauge].map((xOffset, idx) => (
        <group key={idx} position={[xOffset, 0.14, 0]}>
          {/* Rail foot */}
          <mesh position={[0, -0.06, 0]}>
            <boxGeometry args={[0.14, 0.03, length]} />
            <meshStandardMaterial color={BLUEPRINT_TOKENS.colors.steelDark} metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Rail web */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.05, 0.1, length]} />
            <meshStandardMaterial color={BLUEPRINT_TOKENS.colors.steel} metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Rail head */}
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.09, 0.04, length]} />
            <meshStandardMaterial
              color={railColor}
              emissive={railColor}
              emissiveIntensity={0.25 + h * 0.75}
              metalness={0.8}
              roughness={0.25}
            />
          </mesh>
        </group>
      ))}

      {/* Concrete / Blueprint Sleepers */}
      {sleepers.map((zPos, i) => (
        <mesh key={i} position={[0, 0.04, zPos]}>
          <boxGeometry args={[gauge + 0.75, 0.08, 0.22]} />
          <meshStandardMaterial
            color="#102847"
            emissive="#1e3a8a"
            emissiveIntensity={0.15}
            roughness={0.85}
          />
        </mesh>
      ))}
    </group>
  );
};

export interface WheelProps {
  radius?: number;
  width?: number;
  flangeRadius?: number;
  flangeWidth?: number;
  side?: 'left' | 'right';
  position?: [number, number, number];
  spinRps?: number;
  highlightFlange?: boolean;
  startSec?: number;
  durationSec?: number;
}

export const Wheel: React.FC<WheelProps> = ({
  radius = 0.45,
  width = 0.14,
  flangeRadius = 0.53,
  flangeWidth = 0.035,
  side = 'left',
  position = [0, 0.63, 0],
  spinRps = 1.2,
  highlightFlange = false,
  startSec = 0,
  durationSec = 10,
}) => {
  const { sec } = useSceneTime();
  const angle = spin(sec, startSec, durationSec, spinRps);
  const h = highlightFlange ? highlight(sec, startSec, durationSec) : 0;

  // Inner side faces x = 0 (towards center of track)
  const flangeX = side === 'left' ? width / 2 - flangeWidth / 2 : -width / 2 + flangeWidth / 2;

  return (
    <group position={position} rotation={[angle, 0, 0]}>
      {/* Main wheel tread (conical/cylindrical) */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.96, radius, width, 24]} />
        <meshStandardMaterial
          color={BLUEPRINT_TOKENS.colors.steelLight}
          metalness={0.75}
          roughness={0.3}
        />
      </mesh>
      {/* Inner hub */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.45, radius * 0.45, width + 0.03, 16]} />
        <meshStandardMaterial
          color={BLUEPRINT_TOKENS.colors.cyan}
          emissive={BLUEPRINT_TOKENS.colors.cyan}
          emissiveIntensity={0.25}
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
      {/* Inner Flange (prevents derailment!) */}
      <mesh position={[flangeX, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[flangeRadius, flangeRadius, flangeWidth, 24]} />
        <meshStandardMaterial
          color={BLUEPRINT_TOKENS.colors.yellow}
          emissive={BLUEPRINT_TOKENS.colors.yellow}
          emissiveIntensity={0.35 + h * 0.85}
          metalness={0.6}
          roughness={0.25}
        />
      </mesh>
    </group>
  );
};

export interface AxleProps {
  gauge?: number;
  wheelRadius?: number;
  position?: [number, number, number];
  spinRps?: number;
  highlightFlange?: boolean;
  startSec?: number;
  durationSec?: number;
}

export const Axle: React.FC<AxleProps> = ({
  gauge = 1.435,
  wheelRadius = 0.45,
  position = [0, 0.63, 0],
  spinRps = 1.2,
  highlightFlange = false,
  startSec = 0,
  durationSec = 10,
}) => {
  const { sec } = useSceneTime();
  const angle = spin(sec, startSec, durationSec, spinRps);
  const halfGauge = gauge / 2;

  return (
    <group position={position}>
      {/* Steel axle shaft */}
      <mesh rotation={[angle, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.075, 0.075, gauge + 0.25, 16]} />
        <meshStandardMaterial
          color={BLUEPRINT_TOKENS.colors.steel}
          metalness={0.75}
          roughness={0.35}
        />
      </mesh>
      <Wheel
        side="left"
        radius={wheelRadius}
        position={[-halfGauge, 0, 0]}
        spinRps={spinRps}
        highlightFlange={highlightFlange}
        startSec={startSec}
        durationSec={durationSec}
      />
      <Wheel
        side="right"
        radius={wheelRadius}
        position={[halfGauge, 0, 0]}
        spinRps={spinRps}
        highlightFlange={highlightFlange}
        startSec={startSec}
        durationSec={durationSec}
      />
    </group>
  );
};

export interface PoleProps {
  height?: number;
  position?: [number, number, number];
  withArm?: boolean;
  startSec?: number;
  durationSec?: number;
}

export const Pole: React.FC<PoleProps> = ({
  height = 4.2,
  position = [1.8, 0, 0],
  withArm = true,
}) => {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.06, 0.09, height, 10]} />
        <meshStandardMaterial color={BLUEPRINT_TOKENS.colors.steelDark} metalness={0.6} roughness={0.4} />
      </mesh>
      {withArm ? (
        <group position={[-0.75, height - 0.35, 0]}>
          <mesh>
            <boxGeometry args={[1.6, 0.07, 0.07]} />
            <meshStandardMaterial
              color={BLUEPRINT_TOKENS.colors.cyan}
              emissive={BLUEPRINT_TOKENS.colors.cyan}
              emissiveIntensity={0.3}
            />
          </mesh>
          <mesh position={[-0.7, -0.15, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.25, 8]} />
            <meshStandardMaterial
              color={BLUEPRINT_TOKENS.colors.yellow}
              emissive={BLUEPRINT_TOKENS.colors.yellow}
              emissiveIntensity={0.6}
            />
          </mesh>
        </group>
      ) : null}
    </group>
  );
};

export interface SpringProps {
  position?: [number, number, number];
  radius?: number;
  tubeRadius?: number;
  height?: number;
  turns?: number;
  amplitude?: number;
  freqHz?: number;
  highlighted?: boolean;
  startSec?: number;
  durationSec?: number;
}

export const Spring: React.FC<SpringProps> = ({
  position = [0, 0.8, 0],
  radius = 0.26,
  tubeRadius = 0.045,
  height = 0.9,
  turns = 5,
  amplitude = 0.22,
  freqHz = 1.8,
  highlighted = true,
  startSec = 0,
  durationSec = 10,
}) => {
  const { sec } = useSceneTime();
  const offset = oscillate(sec, startSec, durationSec, amplitude, freqHz);
  const h = highlighted ? highlight(sec, startSec, durationSec) : 0;
  const scaleY = Math.max(0.45, 1 + offset);

  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = turns * 18;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * turns * Math.PI * 2;
      points.push(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          (t - 0.5) * height,
          Math.sin(angle) * radius
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, segments, tubeRadius, 8, false);
  }, [radius, tubeRadius, height, turns]);

  return (
    <group position={position}>
      {/* Top & bottom mounting plates */}
      <mesh position={[0, (height * scaleY) / 2 + 0.04, 0]}>
        <cylinderGeometry args={[radius + 0.08, radius + 0.08, 0.06, 16]} />
        <meshStandardMaterial color={BLUEPRINT_TOKENS.colors.steel} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, -(height * scaleY) / 2 - 0.04, 0]}>
        <cylinderGeometry args={[radius + 0.08, radius + 0.08, 0.06, 16]} />
        <meshStandardMaterial color={BLUEPRINT_TOKENS.colors.steel} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Coil */}
      <mesh geometry={geometry} scale={[1, scaleY, 1]}>
        <meshStandardMaterial
          color={BLUEPRINT_TOKENS.colors.yellow}
          emissive={BLUEPRINT_TOKENS.colors.yellow}
          emissiveIntensity={0.2 + h * 0.5}
          metalness={0.65}
          roughness={0.25}
        />
      </mesh>
    </group>
  );
};
