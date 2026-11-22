import React from 'react';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface DiagramOverlayProps {
  /** Show subtle neutral blueprint axis guides. */
  axisGuides?: boolean;
  /** Show neutral circular highlight ring around center focal zone. */
  highlightRing?: boolean;
  /** Show subtle blueprint grid reticle. */
  gridGuide?: boolean;
  /** Palette token ID. */
  palette?: PaletteId;
}

/**
 * Generic 2D vector diagram overlay with domain-neutral geometric guides only.
 * Domain: generic. Entities: grid_guide, axis_guide, highlight_ring.
 */
export const DiagramOverlay: React.FC<DiagramOverlayProps> = ({
  axisGuides = false,
  highlightRing = false,
  gridGuide = false,
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  if (!axisGuides && !highlightRing && !gridGuide) return null;

  const cx = tokens.viewport.width / 2;
  const cy = Math.round(tokens.viewport.height * 0.52);

  return (
    <svg
      width={tokens.viewport.width}
      height={tokens.viewport.height}
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
    >
      {gridGuide ? (
        <rect
          x={90}
          y={260}
          width={tokens.viewport.width - 180}
          height={640}
          rx={12}
          fill="none"
          stroke={tokens.colors.gridSecondary}
          strokeWidth={1.5}
          strokeDasharray="8 8"
          opacity={0.5}
        />
      ) : null}
      {axisGuides ? (
        <g stroke={tokens.colors.primaryGlow} strokeWidth={1.5} strokeDasharray="6 6" opacity={0.55}>
          <line x1={cx} y1={280} x2={cx} y2={880} />
          <line x1={120} y1={cy} x2={tokens.viewport.width - 120} y2={cy} />
        </g>
      ) : null}
      {highlightRing ? (
        <circle
          cx={cx}
          cy={cy}
          r={170}
          fill="none"
          stroke={tokens.colors.accent}
          strokeWidth={2.5}
          strokeDasharray="10 6"
          opacity={0.7}
        />
      ) : null}
    </svg>
  );
};
