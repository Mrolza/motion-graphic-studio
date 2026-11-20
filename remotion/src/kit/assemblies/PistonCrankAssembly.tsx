import React from 'react';
import { solveCrankSlider, valveStateFromCrankAngle } from '../drivers/kinematics';
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
  /** World-space position of crankshaft center. Defaults to [0, 0.2, 0]. */
  position?: [number, number, number];
  /** Render cylinder sleeve as cutaway transparent glass. Defaults to true. */
  cutaway?: boolean;
  /** Optional override ONLY for mutation testing (simulates buggy time-driven valve). */
  overrideIntakeOpen?: boolean;
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * 4-stroke piston, connecting rod, crankshaft, intake/exhaust valves, and spark plug.
 * All moving parts and valve states derive strictly from `crankAngleDeg`.
 */
export const PistonCrankAssembly: React.FC<PistonCrankAssemblyProps> = ({
  entityId = 'piston_crank',
  role = 'focus',
  crankAngleDeg,
  crankRadius = 0.55,
  rodLength = 1.45,
  position = [0, 0.2, 0],
  cutaway = true,
  overrideIntakeOpen,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const crankAngleRad = (crankAngleDeg * Math.PI) / 180;
  const sol = solveCrankSlider({
    crankAngleRad,
    crankRadius,
    rodLength,
    crankCenter: [0, 0, 0],
  });
  const valves = valveStateFromCrankAngle(crankAngleDeg);
  const intakeOpen = overrideIntakeOpen ?? valves.intakeOpen;
  const intakeLift = overrideIntakeOpen === undefined ? valves.intakeLift : overrideIntakeOpen ? 1 : 0;
  const tdcY = rodLength + crankRadius;
  const cylinderBaseY = rodLength - crankRadius - 0.18;
  const cylinderHeight = crankRadius * 2 + 0.95;
  const headY = cylinderBaseY + cylinderHeight + 0.08;

  return (
    <TelemetryEntity
      id={entityId}
      role={role}
      partStates={{
        crank_angle_deg: Math.round(crankAngleDeg * 100) / 100,
        stroke_phase: valves.strokePhase,
        intake_valve: intakeOpen ? 'open' : 'closed',
        exhaust_valve: valves.exhaustOpen ? 'open' : 'closed',
        spark: valves.sparkOn ? 'on' : 'off',
        piston_y: Math.round(sol.pistonPin[1] * 1000) / 1000,
      }}
    >
      <group position={position}>
        {/* Cutaway cylinder sleeve */}
        <mesh position={[0, cylinderBaseY + cylinderHeight / 2, 0]}>
          <cylinderGeometry args={[0.62, 0.62, cylinderHeight, 32, 1, true]} />
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

        {/* Cylinder head */}
        <mesh position={[0, headY, 0]}>
          <boxGeometry args={[1.38, 0.16, 1.38]} />
          <meshStandardMaterial color={tokens.colors.steelDark} metalness={0.6} roughness={0.35} />
        </mesh>

        {/* Intake valve (left) */}
        <group position={[-0.28, headY - 0.08 - intakeLift * 0.22, 0]}>
          <mesh position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.44, 12]} />
            <meshStandardMaterial color={tokens.colors.steelLight} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.15, 0.08, 0.06, 20]} />
            <meshStandardMaterial
              color={intakeOpen ? tokens.colors.primaryGlow : tokens.colors.steel}
              emissive={intakeOpen ? tokens.colors.primary : '#000000'}
              emissiveIntensity={intakeOpen ? 0.9 : 0}
            />
          </mesh>
        </group>

        {/* Exhaust valve (right) */}
        <group position={[0.28, headY - 0.08 - valves.exhaustLift * 0.22, 0]}>
          <mesh position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.44, 12]} />
            <meshStandardMaterial color={tokens.colors.steelLight} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.15, 0.08, 0.06, 20]} />
            <meshStandardMaterial
              color={valves.exhaustOpen ? tokens.colors.danger : tokens.colors.steel}
              emissive={valves.exhaustOpen ? tokens.colors.danger : '#000000'}
              emissiveIntensity={valves.exhaustOpen ? 0.9 : 0}
            />
          </mesh>
        </group>

        {/* Spark plug (center) */}
        <group position={[0, headY + 0.06, 0]}>
          <mesh position={[0, 0.16, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.36, 16]} />
            <meshStandardMaterial color={tokens.colors.white} roughness={0.3} />
          </mesh>
          <mesh position={[0, -0.06, 0]}>
            <sphereGeometry args={[valves.sparkOn ? 0.12 : 0.045, 16, 16]} />
            <meshStandardMaterial
              color={valves.sparkOn ? tokens.colors.accentWarm : tokens.colors.steelDark}
              emissive={valves.sparkOn ? tokens.colors.accent : '#000000'}
              emissiveIntensity={valves.sparkOn ? 2.2 : 0}
            />
          </mesh>
        </group>

        {/* Piston + compression ring */}
        <group position={sol.pistonPin}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.55, 0.55, 0.44, 28]} />
            <meshStandardMaterial color={tokens.colors.steelLight} metalness={0.7} roughness={0.28} />
          </mesh>
          <mesh position={[0, 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.555, 0.02, 10, 32]} />
            <meshStandardMaterial
              color={tokens.colors.accent}
              emissive={tokens.colors.accent}
              emissiveIntensity={0.35}
            />
          </mesh>
        </group>

        {/* Connecting rod */}
        <mesh position={sol.rodCenter} rotation={[0, 0, sol.rodRotationZ]}>
          <cylinderGeometry args={[0.075, 0.09, rodLength, 16]} />
          <meshStandardMaterial color={tokens.colors.primary} metalness={0.6} roughness={0.32} />
        </mesh>

        {/* Crankshaft web + pin */}
        <group rotation={[0, 0, sol.crankRotationZ]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.38, 24]} />
            <meshStandardMaterial color={tokens.colors.steelDark} metalness={0.75} roughness={0.35} />
          </mesh>
          <mesh position={[0, crankRadius * 0.5, 0]}>
            <boxGeometry args={[0.24, crankRadius, 0.26]} />
            <meshStandardMaterial color={tokens.colors.steel} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, crankRadius, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.095, 0.095, 0.32, 16]} />
            <meshStandardMaterial color={tokens.colors.accent} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>

        {/* Subtle TDC reference line */}
        <mesh position={[0, tdcY + 0.35, -0.68]}>
          <boxGeometry args={[1.2, 0.015, 0.015]} />
          <meshStandardMaterial color={tokens.colors.primaryGlow} emissive={tokens.colors.primary} emissiveIntensity={0.5} />
        </mesh>
      </group>
    </TelemetryEntity>
  );
};
