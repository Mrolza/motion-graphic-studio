import React from 'react';
import { formatIdNumber, formatValueWithUnit, normalizeUnit } from '../drivers/kinematics';
import type { DriverValue } from '../drivers/useDriver';
import { clamp01, getLocalProgress, useSceneTime } from '../motion';
import { getThemeTokens, type PaletteId } from '../tokens/index';
import { TelemetryHudBox, type HudZoneId } from './HudZones';

export interface KineticTitleProps {
  id?: string;
  title: string;
  subtitle?: string;
  startSec?: number;
  zone?: HudZoneId;
  palette?: PaletteId;
}

/**
 * Primary kinetic title (>= 44px) placed in the top safe zone.
 */
export const KineticTitle: React.FC<KineticTitleProps> = ({
  id = 'kinetic_title',
  title,
  subtitle,
  startSec = 0,
  zone = 'title',
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const { sec } = useSceneTime();
  const p = getLocalProgress(sec, startSec, 0.45, 'easeOut');
  const fullText = subtitle ? `${title} — ${subtitle}` : title;

  return (
    <TelemetryHudBox
      id={id}
      component="KineticTitle"
      zone={zone}
      text={fullText}
      style={{
        opacity: p,
        transform: `translateY(${(1 - p) * 14}px)`,
      }}
    >
      <div
        style={{
          fontSize: 44,
          fontWeight: 800,
          lineHeight: 1.08,
          color: tokens.colors.white,
          textShadow: tokens.glow.soft,
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 26,
            fontWeight: 500,
            color: tokens.colors.primaryGlow,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </TelemetryHudBox>
  );
};

export interface StatCounterProps {
  id?: string;
  label: string;
  /** Bound single driver. When provided, value comes strictly from driver with NO independent easing. */
  driver?: DriverValue;
  bindToDriver?: boolean;
  display?: 'value' | 'qualitative';
  from?: number;
  to?: number;
  unit?: string;
  decimals?: number;
  startSec?: number;
  durationSec?: number;
  claimRef?: string;
  zone?: HudZoneId;
  palette?: PaletteId;
}

/**
 * Dynamic counter ONLY for changing quantities. Bound to driver when `driver` is passed.
 */
export const StatCounter: React.FC<StatCounterProps> = ({
  id = 'stat_counter',
  label,
  driver,
  bindToDriver = Boolean(driver),
  display = 'value',
  from = 0,
  to = 100,
  unit = '',
  decimals = 0,
  startSec = 0,
  durationSec = 2,
  claimRef,
  zone = 'callout',
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const { sec } = useSceneTime();
  const p = getLocalProgress(sec, startSec, durationSec, 'easeOut');
  const rawVal = bindToDriver && driver ? driver.value : from + (to - from) * p;
  const resolvedUnit = normalizeUnit(driver?.unit ?? unit);
  const formattedWithUnit = formatValueWithUnit(rawVal, resolvedUnit, decimals);
  const isQualitative = display === 'qualitative';
  const ratio = driver ? Math.max(0.05, Math.min(1, driver.progress)) : Math.max(0.05, Math.min(1, p));
  const displayText = isQualitative ? label : `${label}: ${formattedWithUnit}`;

  return (
    <TelemetryHudBox
      id={id}
      component="StatCounter"
      zone={zone}
      text={displayText}
      driverName={bindToDriver && driver ? driver.name : undefined}
      numericValue={isQualitative ? undefined : Math.round(rawVal * 1000) / 1000}
      claimRef={claimRef}
      style={{
        backgroundColor: tokens.colors.panelBg,
        border: `1.5px solid ${tokens.colors.panelBorder}`,
        borderRadius: 12,
        padding: '12px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <span style={{ fontSize: 26, fontWeight: 600, color: tokens.colors.steelLight }}>{label}</span>
      {isQualitative ? (
        <div
          style={{
            width: 180,
            height: 14,
            borderRadius: 7,
            backgroundColor: 'rgba(255,255,255,0.14)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.round(ratio * 100)}%`,
              height: '100%',
              backgroundColor: tokens.colors.accent,
            }}
          />
        </div>
      ) : (
        <span
          style={{
            fontSize: 32,
            fontWeight: 800,
            fontFamily: tokens.fonts.mono,
            color: tokens.colors.accent,
          }}
        >
          {formattedWithUnit}
        </span>
      )}
    </TelemetryHudBox>
  );
};

export interface MeasureRevealProps {
  id?: string;
  label: string;
  /** Fixed dimension/standard string (e.g. "1:20" or "1.435 mm"). No count-up. */
  valueText: string;
  startSec?: number;
  durationSec?: number;
  claimRef?: string;
  zone?: HudZoneId;
  palette?: PaletteId;
}

/**
 * Reveals a fixed dimension or engineering standard by extending a measure bar,
 * then revealing the value without misleading count-up animation.
 */
export const MeasureReveal: React.FC<MeasureRevealProps> = ({
  id = 'measure_reveal',
  label,
  valueText,
  startSec = 0,
  durationSec = 0.75,
  claimRef,
  zone = 'callout',
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const { sec } = useSceneTime();
  const lineP = getLocalProgress(sec, startSec, durationSec * 0.65, 'easeOut');
  const textP = clamp01((sec - (startSec + durationSec * 0.45)) / Math.max(0.15, durationSec * 0.55));

  return (
    <TelemetryHudBox
      id={id}
      component="MeasureReveal"
      zone={zone}
      text={`${label}: ${valueText}`}
      claimRef={claimRef}
      style={{
        backgroundColor: tokens.colors.panelBg,
        border: `1.5px solid ${tokens.colors.panelBorder}`,
        borderRadius: 12,
        padding: '12px 18px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 26, fontWeight: 600, color: tokens.colors.steelLight }}>{label}</span>
        <span
          style={{
            fontSize: 30,
            fontWeight: 800,
            fontFamily: tokens.fonts.mono,
            color: tokens.colors.primaryGlow,
            opacity: textP,
          }}
        >
          {valueText}
        </span>
      </div>
      <div
        style={{
          marginTop: 8,
          height: 4,
          width: `${Math.round(lineP * 100)}%`,
          backgroundColor: tokens.colors.accent,
          borderRadius: 2,
        }}
      />
    </TelemetryHudBox>
  );
};

export interface DimensionLineProps {
  id?: string;
  label: string;
  value: number;
  unit: string;
  decimals?: number;
  startSec?: number;
  zone?: HudZoneId;
  palette?: PaletteId;
}

/**
 * Technical dimension bar with end ticks and id-ID formatted value.
 */
export const DimensionLine: React.FC<DimensionLineProps> = ({
  id = 'dimension_line',
  label,
  value,
  unit,
  decimals = 0,
  startSec = 0,
  zone = 'callout',
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const { sec } = useSceneTime();
  const p = getLocalProgress(sec, startSec, 0.6, 'easeOut');
  const text = `${label}: ${formatIdNumber(value, decimals)} ${unit}`;

  return (
    <TelemetryHudBox
      id={id}
      component="DimensionLine"
      zone={zone}
      text={text}
      numericValue={value}
      style={{
        opacity: p,
        backgroundColor: tokens.colors.panelBg,
        borderLeft: `4px solid ${tokens.colors.accent}`,
        borderRadius: 8,
        padding: '10px 16px',
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, color: tokens.colors.white }}>{text}</div>
    </TelemetryHudBox>
  );
};

export interface CalloutProps {
  id?: string;
  label: string;
  detail?: string;
  /** Optional explicit screen position [x, y] (e.g. anchored to entity screen point). */
  screenAnchor?: [number, number];
  /** Optional target screen point [x, y] to draw a leader line from badge to part. */
  pointerTo?: [number, number];
  claimRef?: string;
  zone?: HudZoneId;
  palette?: PaletteId;
}

/**
 * Technical callout badge (>= 26px), placed in zone or anchored to a screen point with optional leader line.
 */
export const Callout: React.FC<CalloutProps> = ({
  id = 'callout',
  label,
  detail,
  screenAnchor,
  pointerTo,
  claimRef,
  zone = 'callout',
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const text = detail ? `${label} — ${detail}` : label;
  const anchorStyle: React.CSSProperties = screenAnchor
    ? {
        position: 'absolute',
        left: screenAnchor[0],
        top: screenAnchor[1],
      }
    : {};

  const badgeCenter: [number, number] = screenAnchor
    ? [screenAnchor[0] + 150, screenAnchor[1]]
    : [360, 860];

  return (
    <>
      {pointerTo ? (
        <svg
          width={tokens.viewport.width}
          height={tokens.viewport.height}
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
        >
          <line
            x1={badgeCenter[0]}
            y1={badgeCenter[1]}
            x2={pointerTo[0]}
            y2={pointerTo[1]}
            stroke={tokens.colors.accent}
            strokeWidth={2.5}
            strokeDasharray="6 4"
          />
          <circle cx={pointerTo[0]} cy={pointerTo[1]} r={6} fill={tokens.colors.accent} />
        </svg>
      ) : null}
      <TelemetryHudBox
        id={id}
        component="Callout"
        zone={zone}
        text={text}
        claimRef={claimRef}
        style={{
          ...anchorStyle,
          backgroundColor: tokens.colors.panelBg,
          border: `1.5px solid ${tokens.colors.accent}`,
          borderRadius: 10,
          padding: '8px 14px',
        }}
      >
        <div style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.2, color: tokens.colors.accent }}>
          {label}
        </div>
        {detail ? (
          <div style={{ fontSize: 22, lineHeight: 1.25, color: tokens.colors.white, marginTop: 2 }}>
            {detail}
          </div>
        ) : null}
      </TelemetryHudBox>
    </>
  );
};

export { ExaggerationBadge, type ExaggerationBadgeProps } from './ExaggerationBadge';
