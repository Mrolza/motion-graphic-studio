import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { computeWheelsetLayout } from '../drivers/geometry';
import { TelemetryEntity } from '../telemetry/TelemetryEntity';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface RailCrossSectionProps {
  entityId?: string;
  view?: 'section';
  lateralShift?: number;
  gauge?: number;
  taperExaggeration?: number;
  palette?: PaletteId;
}

/**
 * True engineering cross-section profile of twin rail heads + conical wheel tread slices,
 * inner flanges, axle, rail contact points, and effective radius lines.
 */
export const RailCrossSection: React.FC<RailCrossSectionProps> = ({
  entityId = 'rail_cross_section',
  view = 'section',
  lateralShift = 0,
  gauge = 1.435,
  taperExaggeration = 5,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const wheelLeftRef = useRef<THREE.Mesh>(null);
  const wheelRightRef = useRef<THREE.Mesh>(null);
  const contactLeftRef = useRef<THREE.Mesh>(null);
  const contactRightRef = useRef<THREE.Mesh>(null);
  const flangeRef = useRef<THREE.Mesh>(null);
  const halfGauge = gauge / 2;

  const coneRatio = 0.05;
  const wheelRadius = 0.46;
  const railHeadTopY = 0.22;

  const layout = computeWheelsetLayout({
    distance: 0,
    lateralShift,
    wheelRadius,
    gauge,
    coneRatio,
    railHeadTopY,
  });

  const axleY = layout.center[1];
  const treadHalfW = 0.095;
  const visualSlope = coneRatio * taperExaggeration;

  // Build left and right wheel cross-section slice geometries (X-Y plane, thin Z=0.08)
  const { leftGeo, rightGeo } = useMemo(() => {
    const makeWheelSlice = (side: -1 | 1) => {
      // side = -1 (left wheel, inner edge at +treadHalfW, outer edge at -treadHalfW)
      // side = +1 (right wheel, inner edge at -treadHalfW, outer edge at +treadHalfW)
      const innerX = side === -1 ? treadHalfW : -treadHalfW;
      const outerX = side === -1 ? -treadHalfW : treadHalfW;
      const rInner = wheelRadius + visualSlope * treadHalfW;
      const rOuter = Math.max(0.28, wheelRadius - visualSlope * treadHalfW);
      const flangeTipR = rInner + 0.065;
      const flangeInnerX = innerX + (side === -1 ? 0.025 : -0.025);

      const shape = new THREE.Shape();
      // Top-half + bottom-half wheel profile slice centered at (0, 0)
      shape.moveTo(outerX, rOuter);
      shape.lineTo(innerX, rInner);
      shape.lineTo(innerX, flangeTipR);
      shape.lineTo(flangeInnerX, flangeTipR);
      shape.lineTo(flangeInnerX, -flangeTipR);
      shape.lineTo(innerX, -flangeTipR);
      shape.lineTo(innerX, -rInner);
      shape.lineTo(outerX, -rOuter);
      shape.closePath();

      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
      g.translate(0, 0, -0.03);
      return g;
    };
    return { leftGeo: makeWheelSlice(-1), rightGeo: makeWheelSlice(1) };
  }, [visualSlope]);

  const leftAxleWorldX = layout.center[0] + layout.leftWheelLocalX;
  const rightAxleWorldX = layout.center[0] + layout.rightWheelLocalX;

  return (
    <TelemetryEntity
      id={entityId}
      role="focus"
      partRefs={{
        wheel_left: wheelLeftRef,
        wheel_right: wheelRightRef,
        contact_left: contactLeftRef,
        contact_right: contactRightRef,
        flange: flangeRef,
      }}
      partStates={{
        view,
        lateral_shift: Math.round(lateralShift * 1000) / 1000,
        taper_exaggeration: taperExaggeration,
        left_effective_radius: Math.round(layout.leftEffectiveRadius * 10000) / 10000,
        right_effective_radius: Math.round(layout.rightEffectiveRadius * 10000) / 10000,
      }}
      geometry={{
        left_contact_gap: Math.round(layout.constraints.leftContactGap * 10000) / 10000,
        right_contact_gap: Math.round(layout.constraints.rightContactGap * 10000) / 10000,
        flanges_inside: layout.constraints.flangesInside,
      }}
    >
      <group>
        {/* Sleeper cross-section */}
        <mesh position={[0, 0.025, 0]}>
          <boxGeometry args={[gauge + 0.9, 0.05, 0.14]} />
          <meshStandardMaterial color={tokens.colors.gridSecondary} />
        </mesh>

        {/* Twin I-beam rail cross-sections */}
        {([-halfGauge, halfGauge] as const).map((x, idx) => (
          <group key={idx} position={[x, 0.05, 0]}>
            <mesh position={[0, 0.015, 0]}>
              <boxGeometry args={[0.14, 0.03, 0.12]} />
              <meshStandardMaterial color={tokens.colors.steel} metalness={0.65} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.08, 0]}>
              <boxGeometry args={[0.036, 0.11, 0.12]} />
              <meshStandardMaterial color={tokens.colors.steel} metalness={0.65} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.145, 0]}>
              <boxGeometry args={[0.09, 0.05, 0.12]} />
              <meshStandardMaterial
                color={tokens.colors.accent}
                emissive={tokens.colors.accent}
                emissiveIntensity={0.35}
              />
            </mesh>
          </group>
        ))}

        {/* Wheelset cross-section */}
        <group position={[layout.center[0], axleY, 0]}>
          {/* Solid axle */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.055, 0.055, gauge + 0.14, 24]} />
            <meshStandardMaterial color={tokens.colors.steelLight} metalness={0.7} roughness={0.28} />
          </mesh>

          {/* Left wheel cross-section slice */}
          <mesh ref={wheelLeftRef} geometry={leftGeo} position={[layout.leftWheelLocalX, 0, 0]}>
            <meshStandardMaterial color={tokens.colors.steel} metalness={0.6} roughness={0.32} />
          </mesh>

          {/* Right wheel cross-section slice */}
          <mesh ref={wheelRightRef} geometry={rightGeo} position={[layout.rightWheelLocalX, 0, 0]}>
            <meshStandardMaterial color={tokens.colors.steel} metalness={0.6} roughness={0.32} />
          </mesh>

          {/* Highlighted inner flange indicator */}
          <mesh ref={flangeRef} position={[layout.leftFlangeLocalX, -wheelRadius * 0.65, 0.045]}>
            <boxGeometry args={[0.035, 0.18, 0.03]} />
            <meshStandardMaterial
              color={tokens.colors.accentWarm}
              emissive={tokens.colors.accentWarm}
              emissiveIntensity={0.7}
            />
          </mesh>
        </group>

        {/* Contact point markers from computeWheelsetLayout */}
        <mesh ref={contactLeftRef} position={[layout.leftContactWorld[0], railHeadTopY + 0.015, 0.05]}>
          <sphereGeometry args={[0.038, 16, 16]} />
          <meshStandardMaterial
            color={tokens.colors.accentWarm}
            emissive={tokens.colors.accentWarm}
            emissiveIntensity={0.8}
          />
        </mesh>
        <mesh ref={contactRightRef} position={[layout.rightContactWorld[0], railHeadTopY + 0.015, 0.05]}>
          <sphereGeometry args={[0.038, 16, 16]} />
          <meshStandardMaterial
            color={tokens.colors.accentWarm}
            emissive={tokens.colors.accentWarm}
            emissiveIntensity={0.8}
          />
        </mesh>

        {/* Effective radius lines computed directly from layout.leftEffectiveRadius & layout.rightEffectiveRadius */}
        <mesh position={[leftAxleWorldX, axleY - layout.leftEffectiveRadius / 2, 0.06]}>
          <boxGeometry args={[0.022, layout.leftEffectiveRadius, 0.022]} />
          <meshStandardMaterial
            color={tokens.colors.accent}
            emissive={tokens.colors.accent}
            emissiveIntensity={0.7}
          />
        </mesh>
        <mesh position={[rightAxleWorldX, axleY - layout.rightEffectiveRadius / 2, 0.06]}>
          <boxGeometry args={[0.022, layout.rightEffectiveRadius, 0.022]} />
          <meshStandardMaterial
            color={tokens.colors.accentWarm}
            emissive={tokens.colors.accentWarm}
            emissiveIntensity={0.7}
          />
        </mesh>
      </group>
    </TelemetryEntity>
  );
};
