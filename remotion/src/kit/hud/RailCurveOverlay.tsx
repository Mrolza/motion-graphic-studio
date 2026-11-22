import React, { useLayoutEffect } from 'react';
import { useTelemetry } from '../telemetry/TelemetryContext';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface RailCurveOverlayProps {
  /** Show curved track arc guide in the free zone. */
  curveArc?: boolean;
  /** Show straight inertia vector arrow in the free zone. */
  inertiaArrow?: boolean;
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * Rail-domain 2D vector diagram overlay (curved track arc + inertia arrow).
 * Domain: rail. Entities: curve_arc, inertia_arrow.
 */
export const RailCurveOverlay: React.FC<RailCurveOverlayProps> = ({
  curveArc = false,
  inertiaArrow = false,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const telemetry = useTelemetry();

  useLayoutEffect(() => {
    if (telemetry.enabled && inertiaArrow) {
      telemetry.reportEntity({
        id: 'rail_curve_inertia_arrow',
        role: 'prop',
        partStates: {
          arrow_dir_x: 0,
          arrow_dir_y: -1,
          arrow_dir_z: 0,
          bind_to_part: 'unbound',
          arrow_bound: false,
        },
      });
    }
  });

  if (!curveArc && !inertiaArrow) return null;

  return (
    <svg
      width={tokens.viewport.width}
      height={tokens.viewport.height}
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
    >
      <defs>
        <marker
          id="mgs-rail-diagram-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L9,3 z" fill={tokens.colors.accent} />
        </marker>
      </defs>
      {curveArc ? (
        <path
          d="M 240 760 Q 320 520 540 420"
          fill="none"
          stroke={tokens.colors.primaryGlow}
          strokeWidth={3}
          strokeDasharray="10 6"
          opacity={0.85}
        />
      ) : null}
      {inertiaArrow ? (
        <line
          x1={320}
          y1={640}
          x2={320}
          y2={420}
          stroke={tokens.colors.accent}
          strokeWidth={4}
          markerEnd="url(#mgs-rail-diagram-arrow)"
        />
      ) : null}
    </svg>
  );
};
