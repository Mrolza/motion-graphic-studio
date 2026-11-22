import React, { useRef } from 'react';
import * as THREE from 'three';
import { computePistonCrankLayout } from '../drivers/geometry';
import { valveStateFromCrankAngle } from '../drivers/kinematics';
import { TelemetryEntity } from '../telemetry/TelemetryEntity';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface CylinderSectionProps {
  /** Entity ID for telemetry and framing QC. Defaults to "cylinder_section". */
  entityId?: string;
  /** View mode; defaults to "section". */
  view?: 'section';
  /** Role in framing QC. Defaults to "focus". */
  role?: 'focus' | 'prop';
  /** Crankshaft angle in degrees (0-720 for full 4-stroke cycle), from useDriver. */
  crankAngleDeg: number;
  /** Crank throw radius. Defaults to 0.55. */
  crankRadius?: number;
  /** Connecting rod length. Defaults to 1.45. */
  rodLength?: number;
  /** World-space position of crankshaft center. Defaults to [0, 0.35, 0]. */
  position?: [number, number, number];
  /** Optional override ONLY for mutation testing (simulates buggy intake valve). */
  overrideIntakeOpen?: boolean;
  /** Optional override ONLY for mutation testing (simulates buggy exhaust valve). */
  overrideExhaustOpen?: boolean;
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * Cross-section of a 4-stroke engine cylinder: cutaway walls, piston, connecting rod,
 * crank pin, intake & exhaust valves, spark plug, and variable-volume combustion chamber.
 * Domain: engine. Entities: cylinder_section, piston, crank, conrod, intake_valve, exhaust_valve, spark_plug, combustion_chamber.
 */
export const CylinderSection: React.FC<CylinderSectionProps> = ({
  entityId = 'cylinder_section',
  view = 'section',
  role = 'focus',
  crankAngleDeg,
  crankRadius = 0.55,
  rodLength = 1.45,
  position = [0, 0.35, 0],
  overrideIntakeOpen,
  overrideExhaustOpen,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const pistonRef = useRef<THREE.Group>(null);
  const crankRef = useRef<THREE.Group>(null);
  const conrodRef = useRef<THREE.Mesh>(null);
  const intakeRef = useRef<THREE.Group>(null);
  const exhaustRef = useRef<THREE.Group>(null);
  const sparkRef = useRef<THREE.Group>(null);
  const chamberRef = useRef<THREE.Mesh>(null);

  const layout = computePistonCrankLayout({
    crankAngleDeg,
    crankRadius,
    rodLength,
    position,
  });

  const valves = valveStateFromCrankAngle(crankAngleDeg);
  const intakeOpen = overrideIntakeOpen ?? valves.intakeOpen;
  const exhaustOpen = overrideExhaustOpen ?? valves.exhaustOpen;
  const intakeLift = overrideIntakeOpen === undefined ? valves.intakeLift : overrideIntakeOpen ? 1 : 0;
  const exhaustLift = overrideExhaustOpen === undefined ? valves.exhaustLift : overrideExhaustOpen ? 1 : 0;

  const cylinderBaseY = rodLength - crankRadius - 0.16;
  const cylinderHeight = crankRadius * 2 + 0.96;
  const headY = cylinderBaseY + cylinderHeight + 0.08;
  const cylinderCenterY = cylinderBaseY + cylinderHeight / 2;

  const pistonTopLocalY = layout.pistonPinWorld[1] - position[1] + 0.34;
  const chamberHeight = Math.max(0.08, headY - 0.08 - pistonTopLocalY);
  const chamberCenterY = pistonTopLocalY + chamberHeight / 2;
  const maxChamberHeight = Math.max(0.1, headY - 0.08 - (rodLength - crankRadius + 0.34));
  const chamberVolumeRatio = Math.min(1, Math.max(0, chamberHeight / maxChamberHeight));

  const chamberColor =
    valves.strokePhase === 'hisap'
      ? '#38bdf8'
      : valves.strokePhase === 'kompresi'
      ? '#f59e0b'
      : valves.strokePhase === 'usaha'
      ? '#ef4444'
      : '#94a3b8';

  return (
    <TelemetryEntity
      id={entityId}
      role={role}
      partRefs={{
        piston: pistonRef,
        crank: crankRef,
        conrod: conrodRef,
        intake_valve: intakeRef,
        exhaust_valve: exhaustRef,
        spark_plug: sparkRef,
        combustion_chamber: chamberRef,
      }}
      partStates={{
        view,
        crank_angle_deg: Math.round(crankAngleDeg * 100) / 100,
        stroke_phase: valves.strokePhase,
        intake_valve: intakeOpen ? 'open' : 'closed',
        exhaust_valve: exhaustOpen ? 'open' : 'closed',
        spark: valves.sparkOn ? 'on' : 'off',
        piston_y: Math.round(layout.pistonPinWorld[1] * 1000) / 1000,
        chamber_volume_ratio: Math.round(chamberVolumeRatio * 1000) / 1000,
      }}
      geometry={{
        rod_top_gap: Math.round(layout.constraints.rodTopToPistonPinGap * 10000) / 10000,
        rod_bottom_gap: Math.round(layout.constraints.rodBottomToCrankPinGap * 10000) / 10000,
        piston_inside_cylinder: layout.constraints.pistonInsideCylinder,
        chamber_height: Math.round(chamberHeight * 1000) / 1000,
      }}
    >
      <group position={position}>
        {/* Left and right cross-section cylinder walls */}
        <mesh position={[-0.68, cylinderCenterY, 0]}>
          <boxGeometry args={[0.14, cylinderHeight, 0.24]} />
          <meshStandardMaterial color={tokens.colors.steelDark} metalness={0.55} roughness={0.35} />
        </mesh>
        <mesh position={[0.68, cylinderCenterY, 0]}>
          <boxGeometry args={[0.14, cylinderHeight, 0.24]} />
          <meshStandardMaterial color={tokens.colors.steelDark} metalness={0.55} roughness={0.35} />
        </mesh>
        {/* Backplate slice for crisp cross-section contrast */}
        <mesh position={[0, cylinderCenterY, -0.11]}>
          <boxGeometry args={[1.22, cylinderHeight, 0.04]} />
          <meshStandardMaterial color={tokens.colors.bgDeep} roughness={0.9} />
        </mesh>

        {/* Cross-section cylinder head (left & right blocks leaving valve ports) */}
        <mesh position={[-0.48, headY, 0]}>
          <boxGeometry args={[0.56, 0.16, 0.24]} />
          <meshStandardMaterial color={tokens.colors.steel} metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0.48, headY, 0]}>
          <boxGeometry args={[0.56, 0.16, 0.24]} />
          <meshStandardMaterial color={tokens.colors.steel} metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, headY, 0]}>
          <boxGeometry args={[0.38, 0.16, 0.24]} />
          <meshStandardMaterial color={tokens.colors.steel} metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Variable-volume combustion chamber */}
        <mesh ref={chamberRef} position={[0, chamberCenterY, 0.02]}>
          <boxGeometry args={[1.14, chamberHeight, 0.16]} />
          <meshStandardMaterial
            color={chamberColor}
            emissive={chamberColor}
            emissiveIntensity={valves.strokePhase === 'usaha' ? 0.9 : 0.35}
            transparent
            opacity={valves.strokePhase === 'usaha' ? 0.65 : 0.4}
            depthWrite={false}
          />
        </mesh>

        {/* Intake valve (left) */}
        <group ref={intakeRef} position={[-0.3, headY - 0.08 - intakeLift * 0.28, 0.04]}>
          <mesh position={[0, 0.26, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.5, 12]} />
            <meshStandardMaterial color={tokens.colors.steelLight} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.2, 0.1, 0.075, 18]} />
            <meshStandardMaterial
              color={intakeOpen ? '#38bdf8' : tokens.colors.steel}
              emissive={intakeOpen ? '#38bdf8' : '#000000'}
              emissiveIntensity={intakeOpen ? 1.4 : 0}
            />
          </mesh>
        </group>

        {/* Exhaust valve (right) */}
        <group ref={exhaustRef} position={[0.3, headY - 0.08 - exhaustLift * 0.28, 0.04]}>
          <mesh position={[0, 0.26, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.5, 12]} />
            <meshStandardMaterial color={tokens.colors.steelLight} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.2, 0.1, 0.075, 18]} />
            <meshStandardMaterial
              color={exhaustOpen ? tokens.colors.danger : tokens.colors.steel}
              emissive={exhaustOpen ? tokens.colors.danger : '#000000'}
              emissiveIntensity={exhaustOpen ? 1.4 : 0}
            />
          </mesh>
        </group>

        {/* Spark plug (center) */}
        <group ref={sparkRef} position={[0, headY + 0.06, 0.04]}>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 0.38, 16]} />
            <meshStandardMaterial color={tokens.colors.white} roughness={0.3} />
          </mesh>
          <mesh position={[0, -0.09, 0]}>
            <sphereGeometry args={[valves.sparkOn ? 0.18 : 0.055, 16, 16]} />
            <meshStandardMaterial
              color={valves.sparkOn ? '#fef08a' : tokens.colors.steelDark}
              emissive={valves.sparkOn ? '#facc15' : '#000000'}
              emissiveIntensity={valves.sparkOn ? 2.6 : 0}
            />
          </mesh>
        </group>

        {/* Cross-section piston + ring */}
        <group
          ref={pistonRef}
          position={[
            layout.pistonPinWorld[0] - position[0],
            layout.pistonPinWorld[1] - position[1],
            layout.pistonPinWorld[2] - position[2],
          ]}
        >
          <mesh position={[0, 0.12, 0]}>
            <boxGeometry args={[1.1, 0.44, 0.2]} />
            <meshStandardMaterial color={tokens.colors.steelLight} metalness={0.7} roughness={0.28} />
          </mesh>
          <mesh position={[0, 0.28, 0.02]}>
            <boxGeometry args={[1.14, 0.04, 0.22]} />
            <meshStandardMaterial color={tokens.colors.accent} emissive={tokens.colors.accent} emissiveIntensity={0.4} />
          </mesh>
        </group>

        {/* Connecting rod */}
        <mesh ref={conrodRef} position={layout.rodCenterLocal} rotation={[0, 0, layout.rodRotationZ]}>
          <boxGeometry args={[0.14, rodLength, 0.14]} />
          <meshStandardMaterial color={tokens.colors.primary} metalness={0.6} roughness={0.32} />
        </mesh>

        {/* Crankshaft web + pin */}
        <group ref={crankRef} rotation={[0, 0, layout.crankRotationZ]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.24, 0.24, 0.22, 24]} />
            <meshStandardMaterial color={tokens.colors.steelDark} metalness={0.75} roughness={0.35} />
          </mesh>
          <mesh position={[0, crankRadius * 0.5, 0]}>
            <boxGeometry args={[0.24, crankRadius, 0.18]} />
            <meshStandardMaterial color={tokens.colors.steel} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, crankRadius, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.24, 16]} />
            <meshStandardMaterial color={tokens.colors.accent} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      </group>
    </TelemetryEntity>
  );
};
