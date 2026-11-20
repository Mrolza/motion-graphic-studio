import React, { createContext, useContext } from 'react';
import { useVideoConfig } from 'remotion';

export interface TriggerMap {
  /** Maps trigger word or hud_id (lowercased) -> local start frame inside the scene. */
  [key: string]: number;
}

const TriggerContext = createContext<TriggerMap>({});

export const TriggerProvider: React.FC<{
  triggers?: TriggerMap;
  children: React.ReactNode;
}> = ({ triggers = {}, children }) => (
  <TriggerContext.Provider value={triggers}>{children}</TriggerContext.Provider>
);

/**
 * Returns local start frame & second for a storyboard trigger word or hud_id.
 */
export function useTrigger(target: string): { startFrame: number; startSec: number } {
  const map = useContext(TriggerContext);
  const { fps } = useVideoConfig();
  const key = target.trim().toLowerCase();
  const frame = map[key] ?? 0;
  return {
    startFrame: frame,
    startSec: Math.round((frame / Math.max(1, fps)) * 1000) / 1000,
  };
}
