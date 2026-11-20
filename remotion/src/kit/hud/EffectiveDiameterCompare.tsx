import React from 'react';
import { computeEffectiveCompareRadii, type CompareRadiiResult } from '../drivers/kinematics';
import { TelemetryHudBox, type HudZoneId } from './HudZones';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export { computeEffectiveCompareRadii, type CompareRadiiResult };

export interface EffectiveDiameterCompareProps {
  id?: string;
  /** Lateral shift in meters: >0 shifts toward right rail (right wheel = outer), <0 toward left rail. */
  lateralShift: number;
  maxShift?: number;
  zone?: HudZoneId;
  palette?: PaletteId;
}

/**
 * Side-by-side wheel comparison illustrating larger effective diameter and longer travel distance
 * for the outer wheel on a curve. Qualitative only (no numbers), with illustration badge.
 */
export const EffectiveDiameterCompare: React.FC<EffectiveDiameterCompareProps> = ({
  id = 'effective_diameter_compare',
  lateralShift,
  maxShift = 0.06,
  zone = 'callout',
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const radii = computeEffectiveCompareRadii(lateralShift, maxShift);
  const leftLabel = radii.outerSide === 'left' ? 'Roda luar' : radii.outerSide === 'right' ? 'Roda dalam' : 'Roda kiri';
  const rightLabel = radii.outerSide === 'right' ? 'Roda luar' : radii.outerSide === 'left' ? 'Roda dalam' : 'Roda kanan';
  const leftTravelW = Math.round((radii.leftRadiusPx / 50) * 140);
  const rightTravelW = Math.round((radii.rightRadiusPx / 50) * 140);

  return (
    <TelemetryHudBox
      id={id}
      hudId={id}
      component="EffectiveDiameterCompare"
      zone={zone}
      text={`Ilustrasi — skala dilebihkan | ${leftLabel} vs ${rightLabel}`}
      style={{
        backgroundColor: tokens.colors.panelBg,
        border: `1.5px solid ${tokens.colors.panelBorder}`,
        borderRadius: 12,
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: tokens.colors.accent }}>
          Ilustrasi — skala dilebihkan
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: 16 }}>
        {[
          { label: leftLabel, r: radii.leftRadiusPx, travelW: leftTravelW, isOuter: radii.outerSide === 'left' },
          { label: rightLabel, r: radii.rightRadiusPx, travelW: rightTravelW, isOuter: radii.outerSide === 'right' },
        ].map((w, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <svg width={116} height={108} viewBox="0 0 116 108">
              <circle
                cx={58}
                cy={54}
                r={w.r}
                fill="rgba(56, 189, 248, 0.14)"
                stroke={w.isOuter ? tokens.colors.accentWarm : tokens.colors.accent}
                strokeWidth={3.5}
              />
              <circle cx={58} cy={54} r={6} fill={tokens.colors.steelLight} />
            </svg>
            <div style={{ fontSize: 22, fontWeight: 700, color: w.isOuter ? tokens.colors.accentWarm : tokens.colors.white }}>
              {w.label}
            </div>
            <div style={{ width: 140, height: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4 }}>
              <div
                style={{
                  width: w.travelW,
                  height: '100%',
                  borderRadius: 4,
                  backgroundColor: w.isOuter ? tokens.colors.accentWarm : tokens.colors.accent,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </TelemetryHudBox>
  );
};
