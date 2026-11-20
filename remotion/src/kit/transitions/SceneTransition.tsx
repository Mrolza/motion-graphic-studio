import React from 'react';
import { AbsoluteFill } from 'remotion';
import { clamp01, useSceneTime } from '../motion';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export interface SceneTransitionProps {
  /** Transition style matching design tokens. */
  variant?: 'fade' | 'wipe-grid';
  /** Transition duration in seconds at start and end of scene. Defaults to 0.35. */
  durationSec?: number;
  /** Palette token ID. */
  palette?: PaletteId;
  children: React.ReactNode;
}

/**
 * Token-styled scene transition wrapper (fade-in/out or technical grid wipe).
 */
export const SceneTransition: React.FC<SceneTransitionProps> = ({
  variant = 'fade',
  durationSec = 0.35,
  palette = 'blueprint-navy',
  children,
}) => {
  const { sec, durationSec: sceneDur } = useSceneTime();
  const tokens = getThemeTokens(palette);
  const fadeIn = durationSec > 0 ? clamp01(sec / durationSec) : 1;
  const fadeOut = durationSec > 0 ? clamp01((sceneDur - sec) / durationSec) : 1;
  const alpha = Math.max(0.45, Math.min(fadeIn, fadeOut));

  return (
    <AbsoluteFill style={{ opacity: alpha }}>
      {children}
      {variant === 'wipe-grid' && alpha < 0.99 ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            borderTop: `3px solid ${tokens.colors.primary}`,
            opacity: 1 - alpha,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
