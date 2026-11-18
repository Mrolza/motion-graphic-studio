import React from 'react';
import { BLUEPRINT_TOKENS } from './tokens';
import { clamp01, getLocalProgress, useSceneTime } from './motion';

export interface TitleCardProps {
  title: string;
  subtitle?: string;
  tag?: string;
  position?: 'top' | 'center' | 'bottom';
  startSec?: number;
  durationSec?: number;
}

export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  subtitle,
  tag = 'BLUEPRINT // 01',
  position = 'top',
  startSec = 0,
  durationSec = 4,
}) => {
  const { sec } = useSceneTime();
  const enter = getLocalProgress(sec, startSec, 0.45, 'easeOut');
  const exit =
    sec > startSec + durationSec - 0.35
      ? 1 - clamp01((sec - (startSec + durationSec - 0.35)) / 0.35)
      : 1;
  const opacity = sec < startSec ? 0 : Math.min(enter, exit);

  const posStyle: React.CSSProperties =
    position === 'center'
      ? { top: '42%', transform: `translateY(${(1 - enter) * 20}px)` }
      : position === 'bottom'
      ? { bottom: 230, transform: `translateY(${(1 - enter) * 20}px)` }
      : { top: 96, transform: `translateY(${(1 - enter) * -18}px)` };

  return (
    <div
      style={{
        position: 'absolute',
        left: 44,
        right: 44,
        opacity,
        ...posStyle,
        backgroundColor: BLUEPRINT_TOKENS.colors.panelBg,
        border: `1.5px solid ${BLUEPRINT_TOKENS.colors.cyan}`,
        borderLeft: `6px solid ${BLUEPRINT_TOKENS.colors.yellow}`,
        padding: '18px 22px',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
      }}
    >
      <div
        style={{
          fontFamily: BLUEPRINT_TOKENS.fonts.mono,
          fontSize: 16,
          letterSpacing: 2,
          color: BLUEPRINT_TOKENS.colors.yellow,
          marginBottom: 6,
        }}
      >
        {tag}
      </div>
      <div
        style={{
          fontFamily: BLUEPRINT_TOKENS.fonts.sans,
          fontSize: 34,
          fontWeight: 800,
          lineHeight: 1.15,
          color: BLUEPRINT_TOKENS.colors.white,
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 20,
            color: BLUEPRINT_TOKENS.colors.cyanGlow,
            lineHeight: 1.35,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
};

export interface StatCounterProps {
  label: string;
  from: number;
  to: number;
  unit?: string;
  decimals?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  startSec?: number;
  durationSec?: number;
}

export const StatCounter: React.FC<StatCounterProps> = ({
  label,
  from,
  to,
  unit = '',
  decimals = 0,
  position = 'top-right',
  startSec = 0.3,
  durationSec = 2.5,
}) => {
  const { sec } = useSceneTime();
  const p = getLocalProgress(sec, startSec, durationSec, 'easeOut');
  const fade = getLocalProgress(sec, startSec, 0.3, 'easeOut');
  const val = from + (to - from) * p;

  const formatted = val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const posMap: Record<NonNullable<StatCounterProps['position']>, React.CSSProperties> = {
    'top-left': { top: 260, left: 44 },
    'top-right': { top: 260, right: 44 },
    'bottom-left': { bottom: 240, left: 44 },
    'bottom-right': { bottom: 240, right: 44 },
  };

  return (
    <div
      style={{
        position: 'absolute',
        ...posMap[position],
        opacity: sec < startSec ? 0 : fade,
        backgroundColor: BLUEPRINT_TOKENS.colors.panelBg,
        border: `1.5px solid ${BLUEPRINT_TOKENS.colors.yellow}`,
        padding: '14px 20px',
        borderRadius: 6,
        minWidth: 210,
      }}
    >
      <div
        style={{
          fontFamily: BLUEPRINT_TOKENS.fonts.mono,
          fontSize: 15,
          letterSpacing: 1.2,
          color: BLUEPRINT_TOKENS.colors.cyanGlow,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: BLUEPRINT_TOKENS.fonts.mono,
          fontSize: 42,
          fontWeight: 800,
          color: BLUEPRINT_TOKENS.colors.yellow,
          marginTop: 4,
        }}
      >
        {formatted}
        {unit ? (
          <span style={{ fontSize: 22, color: BLUEPRINT_TOKENS.colors.white, marginLeft: 6 }}>
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
};

export interface DimensionLineProps {
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  startSec?: number;
  durationSec?: number;
}

export const DimensionLine: React.FC<DimensionLineProps> = ({
  label,
  x1,
  y1,
  x2,
  y2,
  color = BLUEPRINT_TOKENS.colors.yellow,
  startSec = 0.4,
  durationSec = 1.2,
}) => {
  const { sec } = useSceneTime();
  const p = getLocalProgress(sec, startSec, durationSec, 'easeOut');
  if (sec < startSec) return null;

  const curX2 = x1 + (x2 - x1) * p;
  const curY2 = y1 + (y2 - y1) * p;
  const midX = (x1 + curX2) / 2;
  const midY = (y1 + curY2) / 2;

  return (
    <svg
      width={720}
      height={1280}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <line x1={x1} y1={y1} x2={curX2} y2={curY2} stroke={color} strokeWidth={3} />
      <line x1={x1} y1={y1 - 14} x2={x1} y2={y1 + 14} stroke={color} strokeWidth={3} />
      <line x1={curX2} y1={curY2 - 14} x2={curX2} y2={curY2 + 14} stroke={color} strokeWidth={3} />
      <circle cx={x1} cy={y1} r={5} fill={color} />
      <circle cx={curX2} cy={curY2} r={5} fill={color} />
      {p > 0.35 ? (
        <g transform={`translate(${midX}, ${midY - 26})`}>
          <rect
            x={-90}
            y={-18}
            width={180}
            height={34}
            rx={4}
            fill={BLUEPRINT_TOKENS.colors.bgDeep}
            stroke={color}
            strokeWidth={1.5}
          />
          <text
            x={0}
            y={5}
            textAnchor="middle"
            fill={color}
            fontFamily={BLUEPRINT_TOKENS.fonts.mono}
            fontSize={19}
            fontWeight={700}
          >
            {label}
          </text>
        </g>
      ) : null}
    </svg>
  );
};

export interface CalloutProps {
  title: string;
  body?: string;
  targetX: number;
  targetY: number;
  boxX: number;
  boxY: number;
  startSec?: number;
  durationSec?: number;
}

export const Callout: React.FC<CalloutProps> = ({
  title,
  body,
  targetX,
  targetY,
  boxX,
  boxY,
  startSec = 0.5,
  durationSec = 3.5,
}) => {
  const { sec } = useSceneTime();
  const p = getLocalProgress(sec, startSec, 0.5, 'easeOut');
  if (sec < startSec || sec > startSec + durationSec) return null;

  const lineEndX = targetX + (boxX - targetX) * p;
  const lineEndY = targetY + (boxY - targetY) * p;

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: p }}>
      <svg width={720} height={1280} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={targetX} cy={targetY} r={10} fill="none" stroke={BLUEPRINT_TOKENS.colors.yellow} strokeWidth={2.5} />
        <circle cx={targetX} cy={targetY} r={4.5} fill={BLUEPRINT_TOKENS.colors.yellow} />
        <line
          x1={targetX}
          y1={targetY}
          x2={lineEndX}
          y2={lineEndY}
          stroke={BLUEPRINT_TOKENS.colors.cyan}
          strokeWidth={2.5}
          strokeDasharray="6 4"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: boxX,
          top: boxY,
          transform: 'translate(-50%, -50%)',
          backgroundColor: BLUEPRINT_TOKENS.colors.panelBg,
          border: `1.5px solid ${BLUEPRINT_TOKENS.colors.cyan}`,
          padding: '10px 14px',
          borderRadius: 6,
          maxWidth: 260,
        }}
      >
        <div
          style={{
            fontFamily: BLUEPRINT_TOKENS.fonts.mono,
            fontSize: 17,
            fontWeight: 700,
            color: BLUEPRINT_TOKENS.colors.yellow,
          }}
        >
          {title}
        </div>
        {body ? (
          <div style={{ fontSize: 15, color: BLUEPRINT_TOKENS.colors.white, marginTop: 4 }}>
            {body}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export interface CaptionBarProps {
  text: string;
  startSec?: number;
  durationSec?: number;
}

export const CaptionBar: React.FC<CaptionBarProps> = ({
  text,
  startSec = 0,
  durationSec = 10,
}) => {
  const { sec } = useSceneTime();
  if (sec < startSec || sec > startSec + durationSec) return null;
  const fade = getLocalProgress(sec, startSec, 0.25, 'easeOut');

  return (
    <div
      style={{
        position: 'absolute',
        left: 44,
        right: 44,
        bottom: 110,
        opacity: fade,
        backgroundColor: 'rgba(4, 12, 24, 0.88)',
        border: `1px solid ${BLUEPRINT_TOKENS.colors.panelBorder}`,
        borderRadius: 8,
        padding: '14px 20px',
        textAlign: 'center',
        fontSize: 22,
        fontWeight: 600,
        lineHeight: 1.35,
        color: BLUEPRINT_TOKENS.colors.white,
      }}
    >
      {text}
    </div>
  );
};
