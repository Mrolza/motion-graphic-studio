import React from 'react';
import { getThemeTokens, type PaletteId } from '../tokens/index';
import { TelemetryHudBox } from './HudZones';

export interface ExaggerationBadgeProps {
  factor: number;
  palette?: PaletteId;
}

/**
 * Mandatory kit badge whenever taperExaggeration > 1 in cross-section or wheelset views.
 */
export const ExaggerationBadge: React.FC<ExaggerationBadgeProps> = ({
  factor,
  palette = 'blueprint-navy',
}) => {
  if (factor <= 1) return null;
  const tokens = getThemeTokens(palette);
  return (
    <TelemetryHudBox
      id="__kit_exaggeration_badge"
      hudId="__kit_exaggeration_badge"
      component="ExaggerationBadge"
      zone="title"
      text={`Skala dilebihkan (${factor}×)`}
      style={{
        position: 'absolute',
        top: 292,
        right: 48,
        backgroundColor: 'rgba(10, 22, 40, 0.85)',
        border: `1.5px solid ${tokens.colors.accent}`,
        borderRadius: 8,
        padding: '6px 14px',
        fontSize: 24,
        fontWeight: 700,
        color: tokens.colors.accent,
      }}
    >
      Skala dilebihkan ({factor}×)
    </TelemetryHudBox>
  );
};
