import React from 'react';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface DiagramOverlayProps {
  /** Show curved track arc guide in the free zone. */
  curveArc?: boolean;
  /** Show straight inertia vector arrow in the free zone. */
  inertiaArrow?: boolean;
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * Pure vector 2D diagram overlay (arcs and directional arrows, no unsanctioned text)
 * rendered over the 3D scene inside HudLayout.
 */
export const DiagramOverlay: React.FC<DiagramOverlayProps> = ({
  curveArc = false,
  inertiaArrow = false,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  if (!curveArc && !inertiaArrow) return null;

  return (
    <svg
      width={tokens.viewport.width}
      height={tokens.viewport.height}
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
    >
      <defs>
        <marker
          id="mgs-diagram-arrow"
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
          markerEnd="url(#mgs-diagram-arrow)"
        />
      ) : null}
    </svg>
  );
};
