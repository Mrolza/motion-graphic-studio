import React, { useLayoutEffect, useRef } from 'react';
import { useTelemetry } from '../telemetry/TelemetryContext';
import { getThemeTokens, type PaletteId } from '../tokens/index';

export type HudZoneId = 'title' | 'free' | 'callout' | 'caption';

const ZONE_RECTS: Record<HudZoneId, { top: number; maxHeight: number }> = {
  title: { top: 88, maxHeight: 190 },
  free: { top: 290, maxHeight: 560 },
  callout: { top: 860, maxHeight: 200 },
  caption: { top: 1080, maxHeight: 140 },
};

export interface HudLayoutProps {
  palette?: PaletteId;
  children: React.ReactNode;
}

/**
 * Full-screen 9:16 HUD overlay container.
 */
export const HudLayout: React.FC<HudLayoutProps> = ({
  palette = 'blueprint-navy',
  children,
}) => {
  const tokens = getThemeTokens(palette);
  const telemetry = useTelemetry();
  return (
    <div
      ref={(el) => telemetry.setLayoutElement(el)}
      style={{
        position: 'relative',
        width: tokens.viewport.width,
        height: tokens.viewport.height,
        fontFamily: tokens.fonts.sans,
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  );
};

export interface HudZoneProps {
  zone: HudZoneId;
  gap?: number;
  align?: 'flex-start' | 'center' | 'flex-end';
  palette?: PaletteId;
  children: React.ReactNode;
}

/**
 * Zone-based container that automatically stacks HUD items vertically
 * without overlap inside its designated 9:16 safe band.
 */
export const HudZone: React.FC<HudZoneProps> = ({
  zone,
  gap = 12,
  align = 'stretch',
  palette = 'blueprint-navy',
  children,
}) => {
  const tokens = getThemeTokens(palette);
  const rect = ZONE_RECTS[zone] ?? ZONE_RECTS.callout;
  return (
    <div
      style={{
        position: 'absolute',
        top: rect.top,
        left: tokens.safeZone.left,
        right: tokens.safeZone.right,
        maxHeight: rect.maxHeight,
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        gap,
      }}
    >
      {children}
    </div>
  );
};

export interface TelemetryHudBoxProps {
  id: string;
  hudId?: string;
  component: string;
  zone: HudZoneId;
  text: string;
  driverName?: string;
  numericValue?: number;
  claimRef?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * Measures the rendered DOM bounding box of a HUD element and reports it to telemetry.
 */
export const TelemetryHudBox: React.FC<TelemetryHudBoxProps> = ({
  id,
  hudId,
  component,
  zone,
  text,
  driverName,
  numericValue,
  claimRef,
  style,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const telemetry = useTelemetry();

  useLayoutEffect(() => {
    if (!telemetry.enabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const rootRect = telemetry.getLayoutRect();
    const offsetX = rootRect ? rootRect.left : 0;
    const offsetY = rootRect ? rootRect.top : 0;
    telemetry.reportHud({
      id,
      hud_id: hudId ?? id,
      component,
      zone,
      bbox: {
        x: Math.round((r.left - offsetX) * 10) / 10,
        y: Math.round((r.top - offsetY) * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
      },
      text,
      driverName,
      numericValue,
      claimRef,
    });
  });

  return (
    <div ref={ref} style={style}>
      {children}
    </div>
  );
};
