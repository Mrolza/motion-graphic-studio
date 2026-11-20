import React, { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import {
  TELEMETRY_LOG_PREFIX,
  type TelemetryEntitySample,
  type TelemetryFramePayload,
  type TelemetryHudSample,
} from './types';

interface TelemetryCollector {
  enabled: boolean;
  setLayoutElement: (el: HTMLElement | null) => void;
  getLayoutRect: () => DOMRect | null;
  reportDriver: (name: string, value: number, unit: string) => void;
  reportEntity: (sample: TelemetryEntitySample) => void;
  reportHud: (sample: TelemetryHudSample) => void;
  flushFrame: (frame: number, sec: number) => void;
}

const NOOP_COLLECTOR: TelemetryCollector = {
  enabled: false,
  setLayoutElement: () => {},
  getLayoutRect: () => null,
  reportDriver: () => {},
  reportEntity: () => {},
  reportHud: () => {},
  flushFrame: () => {},
};

const TelemetryContext = createContext<TelemetryCollector>(NOOP_COLLECTOR);

export interface TelemetryProviderProps {
  enabled?: boolean;
  children: React.ReactNode;
}

/**
 * Provides per-frame telemetry collection when `enabled` is true.
 * Zero-overhead no-op when `enabled` is false.
 */
export const TelemetryProvider: React.FC<TelemetryProviderProps> = ({
  enabled = false,
  children,
}) => {
  const layoutElRef = useRef<HTMLElement | null>(null);
  const driversRef = useRef<Record<string, { value: number; unit: string }>>({});
  const entitiesRef = useRef<Map<string, TelemetryEntitySample>>(new Map());
  const hudRef = useRef<Map<string, TelemetryHudSample>>(new Map());
  const lastFrameRef = useRef<number>(-1);
  const frame = useCurrentFrame();

  if (enabled && frame !== lastFrameRef.current) {
    lastFrameRef.current = frame;
    driversRef.current = {};
    entitiesRef.current.clear();
    hudRef.current.clear();
  }

  const collectorRef = useRef<TelemetryCollector>(NOOP_COLLECTOR);

  if (!enabled) {
    collectorRef.current = NOOP_COLLECTOR;
  } else {
    collectorRef.current = {
      enabled: true,
      setLayoutElement: (el) => {
        layoutElRef.current = el;
      },
      getLayoutRect: () => (layoutElRef.current ? layoutElRef.current.getBoundingClientRect() : null),
      reportDriver: (name, value, unit) => {
        driversRef.current[name] = { value: Math.round(value * 1000) / 1000, unit };
      },
      reportEntity: (sample) => {
        entitiesRef.current.set(sample.id, sample);
      },
      reportHud: (sample) => {
        hudRef.current.set(sample.id, sample);
      },
      flushFrame: (f, sec) => {
        const payload: TelemetryFramePayload = {
          frame: f,
          sec: Math.round(sec * 1000) / 1000,
          drivers: { ...driversRef.current },
          entities: [...entitiesRef.current.values()],
          hud: [...hudRef.current.values()],
        };
        console.log(`${TELEMETRY_LOG_PREFIX}${JSON.stringify(payload)}`);
      },
    };
  }

  return (
    <TelemetryContext.Provider value={collectorRef.current}>
      {children}
    </TelemetryContext.Provider>
  );
};

export const TelemetryEmitter: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const collector = useContext(TelemetryContext);

  useLayoutEffect(() => {
    if (collector.enabled) {
      collector.flushFrame(frame, frame / fps);
    }
  });

  return null;
};

export const TelemetryBridge: React.FC<{
  collector: TelemetryCollector;
  children: React.ReactNode;
}> = ({ collector, children }) => {
  return <TelemetryContext.Provider value={collector}>{children}</TelemetryContext.Provider>;
};

export function useTelemetry(): TelemetryCollector {
  return useContext(TelemetryContext);
}
