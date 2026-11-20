import React, { useRef } from 'react';
import * as THREE from 'three';
import { computePistonCrankLayout } from '../drivers/geometry';
import { valveStateFromCrankAngle } from '../drivers/kinematics';
import { TelemetryEntity } from '../telemetry/TelemetryEntity';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface PistonCrankAssemblyProps {
  /** Entity ID for telemetry and framing QC. Defaults to "piston_crank". */
  entityId?: string;
  /** Role in framing QC. Defaults to "focus". */
  role?: 'focus' | 'prop';
  /** Crankshaft angle in degrees (0-720 for full 4-stroke cycle), from useDriver. */
  crankAngleDeg: number;
  /** Crank throw radius. Defaults to 0.55. */
  crankRadius?: number;
  /** Connecting rod length. Defaults to 1.45. */
  rodLength?: number;
  /** World-space position of crankshaft center. Defaults to [0, 0.25, 0]. */
  position?: [number, number, number];
  /** Render cylinder sleeve as cutaway transparent glass. Defaults to true. */
  cutaway?: boolean;
  /** Optional override ONLY for mutation testing (simulates buggy time-driven valve). */
  overrideIntakeOpen?: boolean;
  /** Optional rod offset ONLY for geometry mutation testing (detaches rod from crank pin). */
  detachRodOffset?: [number, number, number];
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * 4-stroke piston, connecting rod, crankshaft, enlarged intake/exhaust valves, spark plug,
 * and driver-linked combustion chamber tint.
 */
export const PistonCrankAssembly: React.FC<PistonCrankAssemblyProps> = ({
  entityId = 'piston_crank',
  role = 'focus',
  crankAngleDeg,
  crankRadius = 0.55,
  rodLength = 1.45,
  position = [0, 0.25, 0],
  cutaway = true,
  overrideIntakeOpen,
  detachRodOffset,
  palette = 'industrial-orange',
}) => {
  const tokens = getThemeTokens(palette);
  const pistonRef = useRef<THREE.Group>(null);
  const crankRef = useRef<THREE.Group>(null);
  const intakeRef = useRef<THREE.Group>(null);
  const exhaustRef = useRef<THREE.Group>(null);
  const sparkRef = useRef<THREE.Group>(null);

  const layout = computePistonCrankLayout({
    crankAngleDeg,
    crankRadius,
    rodLength,
    position,
    detachRodOffset,
  });

  const valves = valveStateFromCrankAngle(crankAngleDeg);
  const intakeOpen = overrideIntakeOpen ?? valves.intakeOpen;
  const intakeLift = overrideIntakeOpen === undefined ? valves.intakeLift : overrideIntakeOpen ? 1 : 0;

  const tdcY = rodLength + crankRadius;
  const cylinderBaseY = rodLength - crankRadius - 0.18;
  const cylinderHeight = crankRadius * 2 + 0.95;
  const headY = cylinderBaseY + cylinderHeight + 0.08;

  const pistonTopLocalY = layout.pistonPinWorld[1] - position[1] + 0.34;
  const chamberHeight = Math.max(0.08, headY - 0.08 - pistonTopLocalY);
  const chamberCenterY = pistonTopLocalY + chamberHeight / 2;

  const chamberColor =
    valves.strokePhase === 'hisap'
      ? '#38bdf8'
      : valves.strokePhase === 'kompresi'
      ? '#f59e0b'
      : valves.strokePhase === 'usaha'
      ? '#ef4444'
      : '#64748b';
  const chamberOpacity =
    valves.strokePhase === 'usaha' ? 0.55 : valves.strokePhase === 'kompresi' ? 0.38 : 0.28;

  return (
    <TelemetryEntity
      id={entityId}
      role={role}
      partRefs={{
        piston: pistonRef,
        crank: crankRef,
        intake_valve: intakeRef,
        exhaust_valve: exhaustRef,
        spark_plug: sparkRef,
      }}
      partStates={{
        crank_angle_deg: Math.round(crankAngleDeg * 100) / 100,
        stroke_phase: valves.strokePhase,
        intake_valve: intakeOpen ? 'open' : 'closed',
        exhaust_valve: valves.exhaustOpen ? 'open' : 'closed',
        spark: valves.sparkOn ? 'on' : 'off',
        piston_y: Math.round(layout.pistonPinWorld[1] * 1000) / 1000,
      }}
      geometry={{
        rod_top_gap: Math.round(layout.constraints.rodTopToPistonPinGap * 10000) / 10000,
        rod_bottom_gap: Math.round(layout.constraints.rodBottomToCrankPinGap * 10000) / 10000,
        piston_inside_cylinder: layout.constraints.pistonInsideCylinder,
      }}
    >
      <group position={position}>
        {/* Cutaway cylinder sleeve */}
        <mesh position={[0, cylinderBaseY + cylinderHeight / 2, 0]}>
          <cylinderGeometry args={[0.64, 0.64, cylinderHeight, 32, 1, true]} />
          <meshStandardMaterial
            color={tokens.colors.primary}
            metalness={0.2}
            roughness={0.25}
            transparent={cutaway}
            opacity={cutaway ? 0.22 : 0.9}
            depthWrite={!cutaway}
            side={2}
          />
        </mesh>

        {/* Driver-linked combustion chamber gas tint */}
        <mesh position={[0, chamberCenterY, 0]}>
          <cylinderGeometry args={[0.56, 0.56, chamberHeight, 24]} />
          <meshStandardMaterial
            color={chamberColor}
            emissive={chamberColor}
            emissiveIntensity={valves.strokePhase === 'usaha' ? 0.85 : 0.3}
            transparent
            opacity={chamberOpacity}
            depthWrite={false}
          />
        </mesh>

        {/* Cylinder head */}
        <mesh position={[0, headY, 0]}>
          <boxGeometry args={[1.44, 0.16, 1.44]} />
          <meshStandardMaterial color={tokens.colors.steelDark} metalness={0.6} roughness={0.35} />
        </mesh>

        {/* Enlarged Intake valve (left) */}
        <group ref={intakeRef} position={[-0.3, headY - 0.08 - intakeLift * 0.28, 0]}>
          <mesh position={[0, 0.26, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.52, 12]} />
            <meshStandardMaterial color={tokens.colors.steelLight} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.21, 0.11, 0.08, 20]} />
            <meshStandardMaterial
              color={intakeOpen ? '#38bdf8' : tokens.colors.steel}
              emissive={intakeOpen ? '#38bdf8' : '#000000'}
              emissiveIntensity={intakeOpen ? 1.3 : 0}
            />
          </mesh>
        </group>

        {/* Enlarged Exhaust valve (right) */}
        <group ref={exhaustRef} position={[0.3, headY - 0.08 - valves.exhaustLift * 0.28, 0]}>
          <mesh position={[0, 0.26, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.52, 12]} />
            <meshStandardMaterial color={tokens.colors.steelLight} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.21, 0.11, 0.08, 20]} />
            <meshStandardMaterial
              color={valves.exhaustOpen ? tokens.colors.danger : tokens.colors.steel}
              emissive={valves.exhaustOpen ? tokens.colors.danger : '#000000'}
              emissiveIntensity={valves.exhaustOpen ? 1.3 : 0}
            />
          </mesh>
        </group>

        {/* Enlarged Spark plug (center) */}
        <group ref={sparkRef} position={[0, headY + 0.06, 0]}>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.4, 16]} />
            <meshStandardMaterial color={tokens.colors.white} roughness={0.3} />
          </mesh>
          <mesh position={[0, -0.09, 0]}>
            <sphereGeometry args={[valves.sparkOn ? 0.19 : 0.06, 16, 16]} />
            <meshStandardMaterial
              color={valves.sparkOn ? '#fef08a' : tokens.colors.steelDark}
              emissive={valves.sparkOn ? '#facc15' : '#000000'}
              emissiveIntensity={valves.sparkOn ? 2.6 : 0}
            />
          </mesh>
        </group>

        {/* Piston + compression ring */}
        <group
          ref={pistonRef}
          position={[
            layout.pistonPinWorld[0] - position[0],
            layout.pistonPinWorld[1] - position[1],
            layout.pistonPinWorld[2] - position[2],
          ]}
        >
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.55, 0.55, 0.44, 28]} />
            <meshStandardMaterial color={tokens.colors.steelLight} metalness={0.7} roughness={0.28} />
          </mesh>
          <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.555, 0.022, 10, 32]} />
            <meshStandardMaterial color={tokens.colors.accent} emissive={tokens.colors.accent} emissiveIntensity={0.4} />
          </mesh>
        </group>

        {/* Connecting rod */}
        <mesh position={layout.rodCenterLocal} rotation={[0, 0, layout.rodRotationZ]}>
          <cylinderGeometry args={[0.075, 0.09, rodLength, 16]} />
          <meshStandardMaterial color={tokens.colors.primary} metalness={0.6} roughness={0.32} />
        </mesh>

        {/* Crankshaft web + pin */}
        <group ref={crankRef} rotation={[0, 0, layout.crankRotationZ]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.26, 0.26, 0.42, 24]} />
            <meshStandardMaterial color={tokens.colors.steelDark} metalness={0.75} roughness={0.35} />
          </mesh>
          <mesh position={[0, crankRadius * 0.5, 0]}>
            <boxGeometry args={[0.26, crankRadius, 0.28]} />
            <meshStandardMaterial color={tokens.colors.steel} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, crankRadius, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.105, 0.105, 0.34, 16]} />
            <meshStandardMaterial color={tokens.colors.accent} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>

        {/* TDC reference line */}
        <mesh position={[0, tdcY + 0.35, -0.68]}>
          <boxGeometry args={[1.2, 0.015, 0.015]} />
          <meshStandardMaterial color={tokens.colors.primaryGlow} emissive={tokens.colors.primary} emissiveIntensity={0.5} />
        </mesh>
      </group>
    </TelemetryEntity>
  );
};
