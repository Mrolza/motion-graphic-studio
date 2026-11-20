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
 * RailCrossSection v3: Portrait-ready Blueprint engineering cross-section of twin rail heads,
 * exaggerated conical wheel treads (>= 10x), inner flanges, axle, and shifting contact points.
 */
export const RailCrossSection: React.FC<RailCrossSectionProps> = ({
  entityId = 'rail_cross_section',
  view = 'section',
  lateralShift = 0,
  gauge = 1.435,
  taperExaggeration = 12,
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
  const effectiveExag = Math.max(10, taperExaggeration);

  const layout = computeWheelsetLayout({
    distance: 0,
    lateralShift,
    wheelRadius,
    gauge,
    coneRatio,
    railHeadTopY,
  });

  const axleY = layout.center[1];
  const treadHalfW = 0.11;
  const visualSlope = coneRatio * effectiveExag;

  const { leftGeo, rightGeo } = useMemo(() => {
    const makeWheelSlice = (side: -1 | 1) => {
      const innerX = side === -1 ? treadHalfW : -treadHalfW;
      const outerX = side === -1 ? -treadHalfW : treadHalfW;
      const rInner = wheelRadius + visualSlope * treadHalfW;
      const rOuter = Math.max(0.24, wheelRadius - visualSlope * treadHalfW);
      const flangeTipR = rInner + 0.075;
      const flangeInnerX = innerX + (side === -1 ? 0.03 : -0.03);

      const shape = new THREE.Shape();
      shape.moveTo(outerX, rOuter);
      shape.lineTo(innerX, rInner);
      shape.lineTo(innerX, flangeTipR);
      shape.lineTo(flangeInnerX, flangeTipR);
      shape.lineTo(flangeInnerX, -flangeTipR);
      shape.lineTo(innerX, -flangeTipR);
      shape.lineTo(innerX, -rInner);
      shape.lineTo(outerX, -rOuter);
      shape.closePath();

      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
      g.translate(0, 0, -0.025);
      return g;
    };
    return { leftGeo: makeWheelSlice(-1), rightGeo: makeWheelSlice(1) };
  }, [visualSlope]);

  // Visual contact point shifts across wheel tread relative to flange as lateralShift changes
  const leftContactX = -halfGauge + lateralShift * 1.4;
  const rightContactX = halfGauge + lateralShift * 1.4;

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
        taper_exaggeration: effectiveExag,
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
        {/* Blueprint sleeper cross-section */}
        <mesh position={[0, 0.025, 0]}>
          <boxGeometry args={[gauge + 0.55, 0.05, 0.12]} />
          <meshBasicMaterial color={tokens.colors.gridSecondary} />
        </mesh>

        {/* Twin I-beam rail cross-sections (Blueprint flat fill + outline) */}
        {([-halfGauge, halfGauge] as const).map((x, idx) => (
          <group key={idx} position={[x, 0.05, 0]}>
            <mesh position={[0, 0.015, 0]}>
              <boxGeometry args={[0.14, 0.03, 0.1]} />
              <meshBasicMaterial color={tokens.colors.steel} />
            </mesh>
            <mesh position={[0, 0.08, 0]}>
              <boxGeometry args={[0.038, 0.11, 0.1]} />
              <meshBasicMaterial color={tokens.colors.steel} />
            </mesh>
            <mesh position={[0, 0.145, 0]}>
              <boxGeometry args={[0.11, 0.05, 0.1]} />
              <meshBasicMaterial color={tokens.colors.accent} />
            </mesh>
          </group>
        ))}

        {/* Wheelset cross-section */}
        <group position={[layout.center[0], axleY, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.052, 0.052, gauge + 0.1, 20]} />
            <meshBasicMaterial color={tokens.colors.steelLight} />
          </mesh>

          <mesh ref={wheelLeftRef} geometry={leftGeo} position={[layout.leftWheelLocalX, 0, 0]}>
            <meshBasicMaterial color={tokens.colors.primary} />
          </mesh>
          <mesh ref={wheelRightRef} geometry={rightGeo} position={[layout.rightWheelLocalX, 0, 0]}>
            <meshBasicMaterial color={tokens.colors.primary} />
          </mesh>

          {/* Inner flange highlights */}
          <mesh ref={flangeRef} position={[layout.leftFlangeLocalX, -wheelRadius * 0.65, 0.04]}>
            <boxGeometry args={[0.035, 0.18, 0.02]} />
            <meshBasicMaterial color={tokens.colors.accentWarm} />
          </mesh>
          <mesh position={[layout.rightFlangeLocalX, -wheelRadius * 0.65, 0.04]}>
            <boxGeometry args={[0.035, 0.18, 0.02]} />
            <meshBasicMaterial color={tokens.colors.accentWarm} />
          </mesh>
        </group>

        {/* Shifting contact point markers */}
        <mesh ref={contactLeftRef} position={[leftContactX, railHeadTopY + 0.015, 0.06]}>
          <sphereGeometry args={[0.042, 16, 16]} />
          <meshBasicMaterial color={tokens.colors.accentWarm} />
        </mesh>
        <mesh ref={contactRightRef} position={[rightContactX, railHeadTopY + 0.015, 0.06]}>
          <sphereGeometry args={[0.042, 16, 16]} />
          <meshBasicMaterial color={tokens.colors.accentWarm} />
        </mesh>
      </group>
    </TelemetryEntity>
  );
};
