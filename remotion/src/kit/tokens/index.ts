/**
 * Design tokens for Motion-Graphic Studio Scene Kit.
 * Palettes: blueprint-navy, industrial-orange, dark-mystery.
 * All scenes must consume tokens from here rather than ad-hoc colors.
 */

export type PaletteId = 'blueprint-navy' | 'industrial-orange' | 'dark-mystery';

export interface ThemeTokens {
  id: PaletteId;
  colors: {
    bg: string;
    bgDeep: string;
    gridPrimary: string;
    gridSecondary: string;
    primary: string;
    primaryGlow: string;
    accent: string;
    accentWarm: string;
    steel: string;
    steelDark: string;
    steelLight: string;
    white: string;
    danger: string;
    panelBg: string;
    panelBorder: string;
  };
  fonts: {
    sans: string;
    mono: string;
  };
  lineWidths: {
    thin: number;
    normal: number;
    bold: number;
  };
  glow: {
    soft: string;
    strong: string;
  };
  viewport: {
    width: number;
    height: number;
    fps: number;
  };
  safeZone: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  typography: {
    minTitlePx: number;
    minCaptionPx: number;
    minCalloutPx: number;
  };
}

const SHARED_LAYOUT = {
  fonts: {
    sans: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    mono: 'JetBrains Mono, Consolas, ui-monospace, monospace',
  },
  lineWidths: {
    thin: 1.5,
    normal: 2.5,
    bold: 4,
  },
  viewport: {
    width: 720,
    height: 1280,
    fps: 30,
  },
  safeZone: {
    top: 100,
    bottom: 220,
    left: 48,
    right: 48,
  },
  typography: {
    minTitlePx: 44,
    minCaptionPx: 32,
    minCalloutPx: 26,
  },
} as const;

export const PALETTES: Record<PaletteId, ThemeTokens> = {
  'blueprint-navy': {
    id: 'blueprint-navy',
    colors: {
      bg: '#071426',
      bgDeep: '#040c18',
      gridPrimary: '#1d4ed8',
      gridSecondary: '#0f294a',
      primary: '#38bdf8',
      primaryGlow: '#7dd3fc',
      accent: '#facc15',
      accentWarm: '#fde047',
      steel: '#94a3b8',
      steelDark: '#334155',
      steelLight: '#cbd5e1',
      white: '#f8fafc',
      danger: '#fb7185',
      panelBg: 'rgba(7, 20, 38, 0.86)',
      panelBorder: 'rgba(56, 189, 248, 0.5)',
    },
    glow: {
      soft: '0 0 12px rgba(56, 189, 248, 0.35)',
      strong: '0 0 22px rgba(125, 211, 252, 0.65)',
    },
    ...SHARED_LAYOUT,
  },
  'industrial-orange': {
    id: 'industrial-orange',
    colors: {
      bg: '#161210',
      bgDeep: '#0c0908',
      gridPrimary: '#9a3412',
      gridSecondary: '#3b1c0e',
      primary: '#fb923c',
      primaryGlow: '#fdba74',
      accent: '#facc15',
      accentWarm: '#fef08a',
      steel: '#a8a29e',
      steelDark: '#44403c',
      steelLight: '#d6d3d1',
      white: '#fafaf9',
      danger: '#f87171',
      panelBg: 'rgba(22, 18, 16, 0.88)',
      panelBorder: 'rgba(251, 146, 60, 0.5)',
    },
    glow: {
      soft: '0 0 12px rgba(251, 146, 60, 0.35)',
      strong: '0 0 22px rgba(253, 186, 116, 0.65)',
    },
    ...SHARED_LAYOUT,
  },
  'dark-mystery': {
    id: 'dark-mystery',
    colors: {
      bg: '#0b0d17',
      bgDeep: '#05060b',
      gridPrimary: '#4c1d95',
      gridSecondary: '#1e1b4b',
      primary: '#a78bfa',
      primaryGlow: '#c4b5fd',
      accent: '#2dd4bf',
      accentWarm: '#5eead4',
      steel: '#9ca3af',
      steelDark: '#374151',
      steelLight: '#d1d5db',
      white: '#f9fafb',
      danger: '#fb7185',
      panelBg: 'rgba(11, 13, 23, 0.88)',
      panelBorder: 'rgba(167, 139, 250, 0.5)',
    },
    glow: {
      soft: '0 0 12px rgba(167, 139, 250, 0.35)',
      strong: '0 0 22px rgba(196, 181, 253, 0.65)',
    },
    ...SHARED_LAYOUT,
  },
};

export function getThemeTokens(palette: PaletteId = 'blueprint-navy'): ThemeTokens {
  return PALETTES[palette] ?? PALETTES['blueprint-navy'];
}
