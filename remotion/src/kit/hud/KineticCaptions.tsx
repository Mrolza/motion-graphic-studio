import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { getThemeTokens, type PaletteId } from '../tokens/index';
import { TelemetryHudBox } from './HudZones';

export interface KineticCaptionWord {
  text: string;
  start_sec: number;
  end_sec: number;
}

export interface KineticCaptionItem {
  id: string;
  start_sec: number;
  end_sec: number;
  lines: string[];
  words: KineticCaptionWord[];
}

export interface KineticCaptionsProps {
  chunks: readonly KineticCaptionItem[];
  palette?: PaletteId;
}

/**
 * Renders 2–5 word kinetic captions in the safe 9:16 caption band (y=942..1020, x<=608)
 * with active word highlighting synced to the VO word timeline.
 */
export const KineticCaptions: React.FC<KineticCaptionsProps> = ({
  chunks,
  palette = 'blueprint-navy',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / Math.max(1, fps);
  const tokens = getThemeTokens(palette);

  const active = chunks.find((c) => sec >= c.start_sec && sec <= c.end_sec + 0.04);
  if (!active) return null;

  const fullText = active.words.map((w) => w.text).join(' ');
  return (
    <div
      style={{
        position: 'absolute',
        top: 942,
        left: 48,
        right: 112,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <TelemetryHudBox
        id="__kit_captions"
        hudId="__kit_captions"
        component="KineticCaptions"
        zone="caption"
        text={fullText}
        style={{
          backgroundColor: 'rgba(8, 17, 32, 0.86)',
          border: `1.5px solid ${tokens.colors.panelBorder}`,
          borderRadius: 10,
          padding: '8px 16px',
          textAlign: 'center',
          fontFamily: tokens.fonts.sans,
          fontSize: 32,
          fontWeight: 700,
          lineHeight: 1.2,
          maxWidth: 556,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 8px' }}>
          {active.words.map((w, idx) => {
            const isActive = sec >= w.start_sec && sec <= w.end_sec + 0.03;
            return (
              <span
                key={`${active.id}_${idx}`}
                style={{
                  color: isActive ? tokens.colors.accent : tokens.colors.white,
                  transition: 'color 60ms linear',
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      </TelemetryHudBox>
    </div>
  );
};
