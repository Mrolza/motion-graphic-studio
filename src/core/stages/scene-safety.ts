import type { FactLedger } from '@core/contracts/fact-ledger';
import type { StoryboardScene } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { extractNumericValuesFromText } from '@core/qc/l1-ledger';
import type {
  ExpectedHudSpec,
  GeometryRule,
  VisualCheckSpec,
  VisualInvariant,
  VisiblePartSpec,
} from '@core/qc/visual/types';

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
  warnings?: string[];
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
    /\b(TelemetryEntity|WheelsetOnRail|PistonCrankAssembly|Suspension|TrainCar|RailCrossSection|EngineBlock)\b/.test(
      code
    );
  if (!hasTelemetryProvider || !hasBlueprintStage || !hasEntityOrAssembly) {
    errors.push(
      'MISSING_TELEMETRY_WRAPPER: adegan wajib memakai TelemetryProvider, BlueprintStage, dan minimal satu TelemetryEntity/Rakitan'
    );
  }
  const telemetryProviderCount = (code.match(/<\s*TelemetryProvider\b/g) ?? []).length;
  if (telemetryProviderCount > 1) {
    errors.push(
      'DOUBLE_TELEMETRY_PROVIDER: hanya boleh ada tepat 1 <TelemetryProvider> di wrapper luar; jangan membungkus *Inner dengan <TelemetryProvider> lagi'
    );
  }

  const directHudMatches = code.match(
    /<\s*(KineticTitle|Callout|MeasureReveal|StatCounter|CompareCard|ListReveal|DimensionLine)\b/g
  );
  if (directHudMatches && directHudMatches.length > 0) {
    errors.push(
      `UNSANCTIONED_HUD_DIRECT_CALL: dilarang memanggil ${directHudMatches[0]} langsung; gunakan <Hud id="..." /> dengan StoryboardHudProvider`
    );
  }
  if (!/\bStoryboardHudProvider\b/.test(code) || !/<\s*Hud\b/.test(code)) {
    errors.push(
      'MISSING_STORYBOARD_HUD: adegan wajib memakai StoryboardHudProvider dan <Hud id="..." />'
    );
  }
  if (/mode\s*=\s*["']frameEntities["']/.test(code) && /<CameraRig[^>]*\b(from|to|radius|height)\s*=/.test(code)) {
    errors.push(
      'CAMERA_MANUAL_DISTANCE: dilarang menyetel jarak kamera manual (from/to/radius/height) saat memakai CameraRig mode="frameEntities"'
    );
  }
  if (/<Arrow3D\b/.test(code) && /\b(PistonCrankAssembly|EngineBlock)\b/.test(code)) {
    errors.push(
      'STATIC_ARROW_FOR_MOTION: dilarang memakai <Arrow3D> statis untuk gerak mesin; gunakan <MotionArrow velocity={...} bindToPart="piston" />'
    );
  }
  if (/\bEngineBlock\b/.test(code) && /size\s*:\s*\[\s*1\.\d/.test(code)) {
    errors.push(
      'SCENE_FOCUSBOX_TOO_SMALL: EngineBlock wajib focusBox={{ center: [0, 1.72, 0], size: [2.05, 3.15, 2.05] }} padding={1.25}'
    );
  }

  const warnings: string[] = [];
  const literalFrameMatches = code.match(/\bframe\s*(?:>=|>|<=|<|===)\s*(\d+)\b/g) ?? [];
  for (const m of literalFrameMatches) {
    const n = Number(m.replace(/\D+/g, ''));
    if (Number.isFinite(n) && n > 6) {
      warnings.push(`SC_LITERAL_TIMING: ambang frame literal (${m}) sebaiknya memakai useTrigger(...)`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, lineCount: lines.length };
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
  triggerRelSec: number,
  ledger?: FactLedger
): VisualCheckSpec {
  const invariants: VisualInvariant[] = [];
  const geometryRules: GeometryRule[] = [];
  const visibleParts: VisiblePartSpec[] = [];

  if (sbScene.focus_entities.includes('wheelset') || sbScene.focus_entities.includes('rail_cross_section')) {
    const entId = sbScene.focus_entities.includes('rail_cross_section') ? 'rail_cross_section' : 'wheelset';
    if (entId === 'wheelset') {
      invariants.push({
        kind: 'wheel_angle_matches_distance',
        entity: 'wheelset',
        radius: 0.46,
        toleranceDeg: 1.5,
      });
      geometryRules.push({ entity: entId, key: 'axle_perpendicular_dot', op: 'max_abs', threshold: 0.02 });
    }
    geometryRules.push(
      { entity: entId, key: 'left_contact_gap', op: 'max_abs', threshold: 0.01 },
      { entity: entId, key: 'right_contact_gap', op: 'max_abs', threshold: 0.01 },
      { entity: entId, key: 'flanges_inside', op: 'equals', expected: true }
    );
  }

  if (sbScene.focus_entities.includes('train_car')) {
    geometryRules.push(
      { entity: 'train_car', key: 'left_contact_gap', op: 'max_abs', threshold: 0.01 },
      { entity: 'train_car', key: 'right_contact_gap', op: 'max_abs', threshold: 0.01 },
      { entity: 'train_car', key: 'axle_perpendicular_dot', op: 'max_abs', threshold: 0.02 },
      { entity: 'train_car', key: 'flanges_inside', op: 'equals', expected: true }
    );
  }

  if (sbScene.focus_entities.includes('piston_crank') || sbScene.focus_entities.includes('engine_block')) {
    const entId = sbScene.focus_entities.includes('engine_block') ? 'engine_block' : 'piston_crank';
    geometryRules.push(
      { entity: entId, key: 'rod_top_gap', op: 'max_abs', threshold: 0.01 },
      { entity: entId, key: 'rod_bottom_gap', op: 'max_abs', threshold: 0.01 },
      { entity: entId, key: 'piston_inside_cylinder', op: 'equals', expected: true }
    );
  }

  const knownWheelParts = new Set(['wheel_left', 'wheel_right', 'contact_left', 'contact_right', 'flange']);
  const knownPistonParts = new Set(['piston', 'crank', 'intake_valve', 'exhaust_valve', 'spark_plug']);
  const mainEntity = sbScene.focus_entities[0]!;
  for (const part of sbScene.visible_parts ?? []) {
    if (
      ((mainEntity === 'wheelset' || mainEntity === 'rail_cross_section') && knownWheelParts.has(part)) ||
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

  const claimMap = new Map((ledger?.claims ?? []).map((c) => [c.id, c]));
  const expectedHud: ExpectedHudSpec[] = sbScene.hud.map((h, idx) => {
    const hid = h.hud_id ?? `${sbScene.id}_H${idx + 1}`;
    const p = h.props ?? {};
    const expectedText = [p.title, p.subtitle, p.label, p.detail, p.valueText, p.text]
      .filter((x) => typeof x === 'string')
      .join(' ');
    const claim = h.claim_ref ? claimMap.get(h.claim_ref) : undefined;
    const claimAllowedNumbers = claim
      ? [
          ...(claim.value !== undefined ? [claim.value] : []),
          ...extractNumericValuesFromText(claim.text),
          ...claim.sources.flatMap((s) => extractNumericValuesFromText(s.quote)),
        ]
      : undefined;
    const qty = h.quantity ?? (typeof p.quantity === 'string' ? p.quantity : undefined);
    const disp = h.display ?? (p.display === 'qualitative' || p.display === 'value' ? p.display : undefined);
    return {
      hud_id: hid,
      component: h.component,
      expectedText,
      claim_ref: h.claim_ref,
      claimValue: claim?.value,
      claimUnit: claim?.unit,
      claimAllowedNumbers,
      bind_to_driver: Boolean(h.bind_to_driver || p.bind_to_driver),
      quantity: qty,
      display: disp,
      when: h.when,
    };
  });

  const isEstablishingOrSummary =
    sbScene.shot_type === 'establishing' || sbScene.shot_type === 'summary';

  return {
    compositionId,
    focusEntities: sbScene.focus_entities,
    invariants,
    geometryRules,
    visibleParts,
    expectedHud,
    maxActiveHudPanels: 2,
    shotType: sbScene.shot_type,
    usesFrameEntities: true,
    minSubjectFillRatio: isEstablishingOrSummary ? 0.3 : 0.2,
    requireFillError: isEstablishingOrSummary,
    syncTargetSec: sbScene.driver ? triggerRelSec : undefined,
    syncToleranceSec: 0.35,
  };
}
