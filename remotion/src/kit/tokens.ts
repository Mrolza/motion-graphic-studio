/**
 * Blueprint 3D style tokens for the P0 Spike Scene Kit.
 * Palette: dark blueprint navy, cyan technical lines, yellow accents.
 */

export const BLUEPRINT_TOKENS = {
  colors: {
    bg: '#071426',
    bgDeep: '#040c18',
    gridPrimary: '#1d4ed8',
    gridSecondary: '#0f294a',
    cyan: '#38bdf8',
    cyanGlow: '#7dd3fc',
    yellow: '#facc15',
    yellowWarm: '#fde047',
    steel: '#94a3b8',
    steelDark: '#334155',
    steelLight: '#cbd5e1',
    white: '#f8fafc',
    coral: '#fb7185',
    panelBg: 'rgba(7, 20, 38, 0.84)',
    panelBorder: 'rgba(56, 189, 248, 0.45)',
  },
  fonts: {
    sans: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    mono: 'JetBrains Mono, Consolas, ui-monospace, monospace',
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
} as const;
