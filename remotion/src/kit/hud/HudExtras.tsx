import React from 'react';
import { getLocalProgress, useSceneTime } from '../motion';
import { getThemeTokens, type PaletteId } from '../tokens/index';
import { TelemetryHudBox, type HudZoneId } from './HudZones';

export interface ListRevealProps {
  id?: string;
  items: string[];
  activeIndex?: number;
  zone?: HudZoneId;
  palette?: PaletteId;
}

export const ListReveal: React.FC<ListRevealProps> = ({
  id = 'list_reveal',
  items,
  activeIndex = 0,
  zone = 'callout',
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const text = items[activeIndex] ?? items.join(' · ');

  return (
    <TelemetryHudBox
      id={id}
      component="ListReveal"
      zone={zone}
      text={text}
      style={{
        backgroundColor: tokens.colors.panelBg,
        border: `1.5px solid ${tokens.colors.panelBorder}`,
        borderRadius: 12,
        padding: '10px 16px',
        display: 'flex',
        gap: 12,
        justifyContent: 'space-between',
      }}
    >
      {items.map((item, idx) => {
        const active = idx === activeIndex;
        return (
          <div
            key={item}
            style={{
              fontSize: 26,
              fontWeight: active ? 800 : 500,
              color: active ? tokens.colors.accent : tokens.colors.steel,
              borderBottom: active ? `3px solid ${tokens.colors.accent}` : '3px solid transparent',
              paddingBottom: 4,
            }}
          >
            {item}
          </div>
        );
      })}
    </TelemetryHudBox>
  );
};

export interface DateStampProps {
  id?: string;
  dateText: string;
  zone?: HudZoneId;
  palette?: PaletteId;
}

export const DateStamp: React.FC<DateStampProps> = ({
  id = 'date_stamp',
  dateText,
  zone = 'title',
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  return (
    <TelemetryHudBox
      id={id}
      component="DateStamp"
      zone={zone}
      text={dateText}
      style={{
        alignSelf: 'flex-start',
        backgroundColor: tokens.colors.panelBg,
        border: `1.5px solid ${tokens.colors.accent}`,
        borderRadius: 8,
        padding: '6px 14px',
      }}
    >
      <span style={{ fontSize: 26, fontWeight: 700, fontFamily: tokens.fonts.mono, color: tokens.colors.accent }}>
        {dateText}
      </span>
    </TelemetryHudBox>
  );
};

export interface TimelineProps {
  id?: string;
  steps: string[];
  progress: number;
  zone?: HudZoneId;
  palette?: PaletteId;
}

export const Timeline: React.FC<TimelineProps> = ({
  id = 'timeline',
  steps,
  progress,
  zone = 'callout',
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <TelemetryHudBox
      id={id}
      component="Timeline"
      zone={zone}
      text={steps.join(' -> ')}
      style={{
        backgroundColor: tokens.colors.panelBg,
        border: `1.5px solid ${tokens.colors.panelBorder}`,
        borderRadius: 10,
        padding: '10px 16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: tokens.colors.white }}>
        {steps.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <div style={{ marginTop: 8, height: 6, backgroundColor: tokens.colors.steelDark, borderRadius: 3 }}>
        <div
          style={{
            height: '100%',
            width: `${Math.round(clamped * 100)}%`,
            backgroundColor: tokens.colors.primary,
            borderRadius: 3,
          }}
        />
      </div>
    </TelemetryHudBox>
  );
};

export interface CompareCardProps {
  id?: string;
  leftTitle: string;
  leftValue: string;
  rightTitle: string;
  rightValue: string;
  zone?: HudZoneId;
  palette?: PaletteId;
}

export const CompareCard: React.FC<CompareCardProps> = ({
  id = 'compare_card',
  leftTitle,
  leftValue,
  rightTitle,
  rightValue,
  zone = 'callout',
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  return (
    <TelemetryHudBox
      id={id}
      component="CompareCard"
      zone={zone}
      text={`${leftTitle}: ${leftValue} vs ${rightTitle}: ${rightValue}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        backgroundColor: tokens.colors.panelBg,
        border: `1.5px solid ${tokens.colors.panelBorder}`,
        borderRadius: 12,
        padding: '12px 16px',
      }}
    >
      <div>
        <div style={{ fontSize: 26, color: tokens.colors.steelLight }}>{leftTitle}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: tokens.colors.primaryGlow }}>{leftValue}</div>
      </div>
      <div>
        <div style={{ fontSize: 26, color: tokens.colors.steelLight }}>{rightTitle}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: tokens.colors.accent }}>{rightValue}</div>
      </div>
    </TelemetryHudBox>
  );
};

export interface WaveformProps {
  id?: string;
  label: string;
  bars?: number;
  zone?: HudZoneId;
  palette?: PaletteId;
}

export const Waveform: React.FC<WaveformProps> = ({
  id = 'waveform',
  label,
  bars = 16,
  zone = 'callout',
  palette = 'blueprint-navy',
}) => {
  const tokens = getThemeTokens(palette);
  const { sec } = useSceneTime();
  const p = getLocalProgress(sec, 0, 1, 'linear');

  return (
    <TelemetryHudBox
      id={id}
      component="Waveform"
      zone={zone}
      text={label}
      style={{
        backgroundColor: tokens.colors.panelBg,
        border: `1.5px solid ${tokens.colors.panelBorder}`,
        borderRadius: 10,
        padding: '10px 16px',
      }}
    >
      <div style={{ fontSize: 26, color: tokens.colors.white, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 28 }}>
        {Array.from({ length: bars }, (_, i) => {
          const h = 8 + Math.round(18 * Math.abs(Math.sin((sec + p) * 4 + i * 0.6)));
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: h,
                backgroundColor: tokens.colors.primary,
                borderRadius: 2,
              }}
            />
          );
        })}
      </div>
    </TelemetryHudBox>
  );
};
