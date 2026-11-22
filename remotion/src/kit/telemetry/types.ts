export interface ScreenBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TelemetryDriverSample {
  name: string;
  value: number;
  unit: string;
}

export interface TelemetryEntitySample {
  id: string;
  role: 'focus' | 'prop';
  bbox?: ScreenBox;
  parts?: Record<string, ScreenBox>;
  partStates?: Record<string, string | number | boolean>;
  geometry?: Record<string, number | boolean>;
}

export interface TelemetryHudSample {
  id: string;
  hud_id?: string;
  component: string;
  zone: 'title' | 'free' | 'callout' | 'caption';
  bbox: ScreenBox;
  text: string;
  domText?: string;
  truncated?: boolean;
  driverName?: string;
  numericValue?: number;
  claimRef?: string;
}

export interface TelemetryFramePayload {
  frame: number;
  sec: number;
  drivers: Record<string, { value: number; unit: string }>;
  entities: TelemetryEntitySample[];
  hud: TelemetryHudSample[];
}

export const TELEMETRY_LOG_PREFIX = 'MGS_TELEMETRY ';
