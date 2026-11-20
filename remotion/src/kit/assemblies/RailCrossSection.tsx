import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
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
 * RailCrossSection v3 (F1): True geometric portrait cross-section.
 * Rails are fixed; wheelset shifts laterally, each wheel's height & axle tilt follow
 * the exaggerated conical tread intersection with the fixed rail head top.
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
  const railLeftRef = useRef<THREE.Mesh>(null);
  const railRightRef = useRef<THREE.Mesh>(null);
  const contactLeftRef = useRef<THREE.Mesh>(null);
  const contactRightRef = useRef<THREE.Mesh>(null);
  const radiusLeftRef = useRef<THREE.Mesh>(null);
  const radiusRightRef = useRef<THREE.Mesh>(null);
  const flangeRef = useRef<THREE.Mesh>(null);

  const halfGauge = gauge / 2;
  const coneRatio = 0.05;
  const wheelRadius = 0.46;
  const railHeadTopY = 0.22;
  const effectiveExag = Math.max(10, taperExaggeration);
  const visualSlope = coneRatio * effectiveExag;
  const treadHalfW = 0.12;

  // Intersection of exaggerated conical tread with fixed rail head at x = ±halfGauge
  const rLeft = wheelRadius - visualSlope * lateralShift;
  const rRight = wheelRadius + visualSlope * lateralShift;
  const leftAxleY = railHeadTopY + rLeft;
  const rightAxleY = railHeadTopY + rRight;
  const leftWheelX = -halfGauge + lateralShift;
  const rightWheelX = halfGauge + lateralShift;
  const midAxleY = (leftAxleY + rightAxleY) / 2;
  const axleTiltRad = Math.atan2(rightAxleY - leftAxleY, gauge);

  const { leftGeo, rightGeo } = useMemo(() => {
    const makeWheelSlice = (side: -1 | 1) => {
      const innerX = side === -1 ? treadHalfW : -treadHalfW;
      const outerX = side === -1 ? -treadHalfW : treadHalfW;
      const rInner = wheelRadius + visualSlope * treadHalfW;
      const rOuter = Math.max(0.22, wheelRadius - visualSlope * treadHalfW);
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

  const leftFlangeX = leftWheelX + treadHalfW + 0.015;
  const rightFlangeX = rightWheelX - treadHalfW - 0.015;

  return (
    <TelemetryEntity
      id={entityId}
      role="focus"
      partRefs={{
        wheel_left: wheelLeftRef,
        wheel_right: wheelRightRef,
        rail_left: railLeftRef,
        rail_right: railRightRef,
        contact_left: contactLeftRef,
        contact_right: contactRightRef,
        radius_left: radiusLeftRef,
        radius_right: radiusRightRef,
        flange: flangeRef,
      }}
      partStates={{
        view,
        lateral_shift: Math.round(lateralShift * 1000) / 1000,
        taper_exaggeration: effectiveExag,
        left_effective_radius: Math.round(rLeft * 10000) / 10000,
        right_effective_radius: Math.round(rRight * 10000) / 10000,
      }}
      geometry={{
        left_contact_gap: 0,
        right_contact_gap: 0,
        flanges_inside: leftFlangeX > -halfGauge && rightFlangeX < halfGauge,
      }}
    >
      <group>
        {/* Fixed Blueprint sleeper cross-section */}
        <mesh position={[0, 0.025, 0]}>
          <boxGeometry args={[gauge + 0.55, 0.05, 0.12]} />
          <meshBasicMaterial color={tokens.colors.gridSecondary} />
        </mesh>

        {/* Fixed Twin I-beam rail cross-sections (head width = 0.16m) */}
        {([-halfGauge, halfGauge] as const).map((x, idx) => (
          <group key={idx} position={[x, 0.05, 0]}>
            <mesh position={[0, 0.015, 0]}>
              <boxGeometry args={[0.16, 0.03, 0.1]} />
              <meshBasicMaterial color={tokens.colors.steel} />
            </mesh>
            <mesh position={[0, 0.08, 0]}>
              <boxGeometry args={[0.038, 0.11, 0.1]} />
              <meshBasicMaterial color={tokens.colors.steel} />
            </mesh>
            <mesh ref={idx === 0 ? railLeftRef : railRightRef} position={[0, 0.145, 0]}>
              <boxGeometry args={[0.16, 0.05, 0.1]} />
              <meshBasicMaterial color={tokens.colors.accent} />
            </mesh>
          </group>
        ))}

        {/* Tilted axle connecting left & right wheel centers */}
        <mesh position={[lateralShift, midAxleY, 0]} rotation={[0, 0, Math.PI / 2 + axleTiltRad]}>
          <cylinderGeometry args={[0.048, 0.048, gauge + 0.1, 20]} />
          <meshBasicMaterial color={tokens.colors.steelLight} />
        </mesh>

        {/* Left & right conical wheel cross-sections resting flush on rail heads */}
        <mesh ref={wheelLeftRef} geometry={leftGeo} position={[leftWheelX, leftAxleY, 0]}>
          <meshBasicMaterial color={tokens.colors.primary} />
        </mesh>
        <mesh ref={wheelRightRef} geometry={rightGeo} position={[rightWheelX, rightAxleY, 0]}>
          <meshBasicMaterial color={tokens.colors.primary} />
        </mesh>

        {/* Effective radius lines from each wheel's axle center to its rail contact point */}
        <mesh ref={radiusLeftRef} position={[-halfGauge, railHeadTopY + rLeft / 2, 0.045]}>
          <boxGeometry args={[0.024, rLeft, 0.02]} />
          <meshBasicMaterial color={tokens.colors.accentWarm} />
        </mesh>
        <mesh ref={radiusRightRef} position={[halfGauge, railHeadTopY + rRight / 2, 0.045]}>
          <boxGeometry args={[0.024, rRight, 0.02]} />
          <meshBasicMaterial color={tokens.colors.accentWarm} />
        </mesh>

        {/* Inner flange markers */}
        <mesh ref={flangeRef} position={[leftFlangeX, leftAxleY - wheelRadius * 0.65, 0.04]}>
          <boxGeometry args={[0.026, 0.14, 0.02]} />
          <meshBasicMaterial color={tokens.colors.steelLight} />
        </mesh>

        {/* Contact points at intersection of tread and fixed rail head */}
        <mesh ref={contactLeftRef} position={[-halfGauge, railHeadTopY, 0.06]}>
          <sphereGeometry args={[0.036, 16, 16]} />
          <meshBasicMaterial color={tokens.colors.accentWarm} />
        </mesh>
        <mesh ref={contactRightRef} position={[halfGauge, railHeadTopY, 0.06]}>
          <sphereGeometry args={[0.036, 16, 16]} />
          <meshBasicMaterial color={tokens.colors.accentWarm} />
        </mesh>
      </group>
    </TelemetryEntity>
  );
};
