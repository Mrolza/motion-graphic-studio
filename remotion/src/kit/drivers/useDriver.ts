import { EasingMode, getLocalProgress, useSceneTime } from '../motion';
import { useTelemetry } from '../telemetry/TelemetryContext';

export interface DriverConfig {
  /** Unique driver name (e.g. "crank_angle", "distance"). */
  name: string;
  /** Starting value at startSec. */
  from: number;
  /** Ending value at startSec + durationSec. */
  to: number;
  /** Physical unit (e.g. "deg", "m"). */
  unit: string;
  /** Start time in seconds. Defaults to 0. */
  startSec?: number;
  /** Duration in seconds. Defaults to scene duration. */
  durationSec?: number;
  /** Interpolation curve. Defaults to "linear" for mechanical drivers. */
  curve?: EasingMode;
}

export interface DriverValue {
  name: string;
  value: number;
  unit: string;
  progress: number;
}

/**
 * Single-source driver hook. Derives a continuous physical quantity per frame
 * and reports it to telemetry when enabled.
 */
export function useDriver(config: DriverConfig): DriverValue {
  const { sec, durationSec: sceneDur } = useSceneTime();
  const telemetry = useTelemetry();
  const dur = config.durationSec ?? sceneDur;
  const progress = getLocalProgress(sec, config.startSec ?? 0, dur, config.curve ?? 'linear');
  const value = config.from + (config.to - config.from) * progress;

  if (telemetry.enabled) {
    telemetry.reportDriver(config.name, value, config.unit);
  }

  return {
    name: config.name,
    value,
    unit: config.unit,
    progress,
  };
}
