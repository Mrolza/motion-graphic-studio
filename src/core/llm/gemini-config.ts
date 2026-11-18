import { ThinkingLevel, type ThinkingConfig } from '@google/genai';

export const GEMINI_REQUEST_TIMEOUT_MS = 90_000;
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export function resolveGeminiModel(override?: string): string {
  return override || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

/**
 * Optimal thinkingConfig per Gemini model version:
 * - `gemini-3.8*` does not support MINIMAL -> use LOW.
 * - `gemini-3*` uses MINIMAL.
 * - `gemini-2.5*` / others use thinkingBudget: 0.
 */
export function buildGeminiThinkingConfig(modelName: string): ThinkingConfig {
  if (/gemini-3\.8/i.test(modelName)) {
    return { thinkingLevel: ThinkingLevel.LOW };
  }
  if (/gemini-3/i.test(modelName)) {
    return { thinkingLevel: ThinkingLevel.MINIMAL };
  }
  return { thinkingBudget: 0 };
}
