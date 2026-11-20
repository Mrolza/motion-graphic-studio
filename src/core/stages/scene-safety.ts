import type { StoryboardScene } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import type { GeometryRule, VisualCheckSpec, VisualInvariant, VisiblePartSpec } from '@core/qc/visual/types';

const ALLOWED_IMPORTS = new Set(['react', 'remotion', '../../../kit', '../../kit', '../kit']);

const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'fetch', re: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket', re: /\bWebSocket\b/ },
  { name: 'eval', re: /\beval\s*\(/ },
  { name: 'new Function', re: /\bnew\s+Function\b/ },
  { name: 'process', re: /\bprocess\./ },
  { name: 'node builtin', re: /['"]node:/ },
  { name: 'external URL', re: /https?:\/\// },
  { name: 'data URI', re: /data:image\// },
  { name: 'dangerouslySetInnerHTML', re: /\bdangerouslySetInnerHTML\b/ },
  { name: 'document.cookie', re: /\bdocument\.cookie\b/ },
  { name: 'window.location', re: /\bwindow\.location\b/ },
];

export interface SafetyValidationResult {
  ok: boolean;
  errors: string[];
  lineCount: number;
}

/**
 * Validates generated Remotion scene TSX against import whitelist, forbidden APIs,
 * 300-line limit, and mandatory telemetry wrappers.
 */
export function validateSceneCodeSafety(code: string): SafetyValidationResult {
  const errors: string[] = [];
  const lines = code.split(/\r?\n/);
  if (lines.length > 300) {
    errors.push(`LINE_LIMIT_EXCEEDED: ${lines.length} baris (maks 300 baris)`);
  }

  const importMatches = code.matchAll(/import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g);
  for (const m of importMatches) {
    const mod = m[1]!;
    if (!ALLOWED_IMPORTS.has(mod)) {
      errors.push(`FORBIDDEN_IMPORT: modul "${mod}" tidak diizinkan (hanya react, remotion, ../../../kit)`);
    }
  }

  for (const fp of FORBIDDEN_PATTERNS) {
    if (fp.re.test(code)) {
      errors.push(`FORBIDDEN_API: penggunaan "${fp.name}" dilarang di kode adegan`);
    }
  }

  const hasTelemetryProvider = /\bTelemetryProvider\b/.test(code);
  const hasBlueprintStage = /\bBlueprintStage\b/.test(code);
  const hasEntityOrAssembly =
    /\b(TelemetryEntity|WheelsetOnRail|PistonCrankAssembly|Suspension)\b/.test(code);
  if (!hasTelemetryProvider || !hasBlueprintStage || !hasEntityOrAssembly) {
    errors.push(
      'MISSING_TELEMETRY_WRAPPER: adegan wajib memakai TelemetryProvider, BlueprintStage, dan minimal satu TelemetryEntity/Rakitan (WheelsetOnRail/PistonCrankAssembly/Suspension)'
    );
  }

  return { ok: errors.length === 0, errors, lineCount: lines.length };
}

/**
 * Finds the relative start second inside a scene when its first trigger word is spoken.
 */
export function findTriggerTimeInScene(
  sceneId: string,
  triggerWords: string[],
  timeline: Timeline
): number {
  const tlScene = timeline.scenes.find((s) => s.scene_id === sceneId);
  if (!tlScene) return 0;
  const dur = Math.max(0.5, tlScene.end - tlScene.start);
  const sceneWords = timeline.words.filter((w) => w.scene_id === sceneId);
  const normalizedTriggers = triggerWords
    .map((t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter(Boolean);

  for (const w of sceneWords) {
    const nw = w.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (normalizedTriggers.some((tw) => nw === tw || nw.includes(tw))) {
      const rel = Math.max(0, w.start - tlScene.start);
      // Leave at least 0.8s before scene end for visible motion
      return Math.round(Math.min(rel, Math.max(0, dur - 0.8)) * 100) / 100;
    }
  }
  return 0;
}

/**
 * Builds a VisualCheckSpec for S9 scene validation from a StoryboardScene.
 */
export function buildVisualSpecForScene(
  compositionId: string,
  sbScene: StoryboardScene,
  triggerRelSec: number
): VisualCheckSpec {
  const invariants: VisualInvariant[] = [];
  const geometryRules: GeometryRule[] = [];
  const visibleParts: VisiblePartSpec[] = [];

  if (sbScene.focus_entities.includes('wheelset')) {
    invariants.push({
      kind: 'wheel_angle_matches_distance',
      entity: 'wheelset',
      radius: 0.46,
      toleranceDeg: 1.5,
    });
    geometryRules.push(
      { entity: 'wheelset', key: 'left_contact_gap', op: 'max_abs', threshold: 0.01 },
      { entity: 'wheelset', key: 'right_contact_gap', op: 'max_abs', threshold: 0.01 },
      { entity: 'wheelset', key: 'axle_perpendicular_dot', op: 'max_abs', threshold: 0.02 },
      { entity: 'wheelset', key: 'flanges_inside', op: 'equals', expected: true }
    );
  }

  if (sbScene.focus_entities.includes('piston_crank')) {
    geometryRules.push(
      { entity: 'piston_crank', key: 'rod_top_gap', op: 'max_abs', threshold: 0.01 },
      { entity: 'piston_crank', key: 'rod_bottom_gap', op: 'max_abs', threshold: 0.01 },
      { entity: 'piston_crank', key: 'piston_inside_cylinder', op: 'equals', expected: true }
    );
  }

  const knownWheelParts = new Set(['wheel_left', 'wheel_right', 'contact_left', 'contact_right', 'flange']);
  const knownPistonParts = new Set(['piston', 'crank', 'intake_valve', 'exhaust_valve', 'spark_plug']);
  const mainEntity = sbScene.focus_entities[0]!;
  for (const part of sbScene.visible_parts ?? []) {
    if (
      (mainEntity === 'wheelset' && knownWheelParts.has(part)) ||
      (mainEntity === 'piston_crank' && knownPistonParts.has(part))
    ) {
      visibleParts.push({ entity: mainEntity, part, maxHudCoverRatio: 0.25 });
    }
  }

  const knownStates = new Set([
    'intake_valve',
    'exhaust_valve',
    'spark',
    'stroke_phase',
    'wheel_angle_deg',
    'lateral_shift',
  ]);
  for (const inv of sbScene.invariants ?? []) {
    const [stateKey, expectedVal] = inv.state.includes('=')
      ? inv.state.split('=', 2)
      : [inv.state, 'open'];
    const cleanKey = stateKey?.trim();
    if (cleanKey && knownStates.has(cleanKey) && (inv.entity === 'wheelset' || inv.entity === 'piston_crank')) {
      invariants.push({
        kind: 'driver_state',
        entity: inv.entity,
        stateKey: cleanKey,
        expectedValue: expectedVal === 'true' ? true : expectedVal === 'false' ? false : expectedVal!.trim(),
        whenDriverBetween: inv.when.driver_between,
        driverName: sbScene.driver?.name,
        epsilon: 4,
      });
    }
  }

  return {
    compositionId,
    focusEntities: sbScene.focus_entities,
    invariants,
    geometryRules,
    visibleParts,
    maxActiveHudPanels: 2,
    syncTargetSec: sbScene.driver ? triggerRelSec : undefined,
    syncToleranceSec: 0.35,
  };
}
