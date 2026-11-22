import type { FactLedger } from '@core/contracts/fact-ledger';
import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { getHudClaimRefs, type Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { extractNumericValuesFromText } from '@core/qc/l1-ledger';
import { extractHudDisplayText, QUANTITY_LABELS } from './l5-semantic';

const DISPLAY_FIELDS = [
  'title',
  'subtitle',
  'label',
  'detail',
  'valueText',
  'leftTitle',
  'leftValue',
  'rightTitle',
  'rightValue',
  'dateText',
  'items',
  'steps',
];

function collectTextValues(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of DISPLAY_FIELDS) {
    const v = obj[key];
    if (typeof v === 'string' || typeof v === 'number') {
      parts.push(String(v));
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string' || typeof item === 'number') parts.push(String(item));
      }
    }
  }
  return parts.join(' ');
}

/**
 * Deterministic code checks for Storyboard (S7).
 */
export function verifyStoryboardCode(
  storyboard: Storyboard,
  script: Script,
  timeline: Timeline,
  ledger: FactLedger
): QcReport {
  const issues: QcIssue[] = [];
  const claimMap = new Map(ledger.claims.map((c) => [c.id, c]));
  const tlSceneMap = new Map(timeline.scenes.map((s) => [s.scene_id, s]));
  const scriptSceneMap = new Map(script.scenes.map((s) => [s.id, s]));

  if (storyboard.scenes.length !== script.scenes.length) {
    issues.push({
      severity: 'error',
      message: `SB_SCENE_COUNT: jumlah adegan storyboard (${storyboard.scenes.length}) != naskah (${script.scenes.length})`,
      ref: 'storyboard',
    });
  }

  for (const sbScene of storyboard.scenes) {
    const ref = sbScene.id;
    const tlScene = tlSceneMap.get(sbScene.id);
    const scScene = scriptSceneMap.get(sbScene.id);

    if (!tlScene || !scScene) {
      issues.push({
        severity: 'error',
        message: `SB_UNKNOWN_SCENE: adegan "${sbScene.id}" tidak ditemukan di script/timeline`,
        ref,
      });
      continue;
    }

    const expectedDur = Number((tlScene.end - tlScene.start).toFixed(3));
    if (Math.abs(sbScene.duration_sec - expectedDur) > 0.15) {
      issues.push({
        severity: 'error',
        message: `SB_DURATION_MISMATCH: durasi ${sbScene.duration_sec}s != timeline ${expectedDur}s`,
        ref,
      });
    }

    const sceneNarration = scScene.sentences
      .map((s) => `${s.text} ${s.spoken_text ?? ''}`)
      .join(' ')
      .toLowerCase();

    if (sbScene.trigger_words.length === 0) {
      issues.push({
        severity: 'error',
        message: 'SB_EMPTY_TRIGGER: trigger_words tidak boleh kosong',
        ref,
      });
    } else {
      for (const tw of sbScene.trigger_words) {
        if (!sceneNarration.includes(tw.toLowerCase().trim())) {
          issues.push({
            severity: 'error',
            message: `SB_MISSING_TRIGGER_WORD: kata pemicu "${tw}" tidak ada di narasi adegan ${sbScene.id}`,
            ref,
          });
        }
      }
    }

    if (sbScene.focus_entities.length === 0) {
      issues.push({ severity: 'error', message: 'SB_NO_FOCUS_ENTITY: focus_entities kosong', ref });
    }
    if (!sbScene.visible_parts || sbScene.visible_parts.length === 0) {
      issues.push({ severity: 'error', message: 'SB_NO_VISIBLE_PARTS: visible_parts wajib diisi', ref });
    }
    if (sbScene.hud.length > 2) {
      issues.push({
        severity: 'error',
        message: `SB_HUD_BUDGET: ${sbScene.hud.length} panel HUD di ${sbScene.id} (maks 2)`,
        ref,
      });
    }
    if (!sbScene.shot_type) {
      issues.push({
        severity: 'error',
        message: `SB_MISSING_SHOT_TYPE: adegan ${sbScene.id} wajib menentukan shot_type`,
        ref,
      });
    }

    for (const h of sbScene.hud) {
      if (!h.hud_id) {
        issues.push({
          severity: 'error',
          message: `SB_MISSING_HUD_ID: HUD "${h.component}" di ${sbScene.id} wajib memiliki hud_id unik`,
          ref,
        });
      }
      if (h.bind_to_driver && !sbScene.driver) {
        issues.push({
          severity: 'error',
          message: `SB_HUD_NO_DRIVER: HUD "${h.hud_id ?? h.component}" memakai bind_to_driver tetapi adegan tidak punya driver`,
          ref,
        });
      }

      const propText = collectTextValues(h.props);
      if (h.component === 'Callout') {
        const wordCount = propText.trim().split(/\s+/).filter(Boolean).length;
        if (wordCount > 12) {
          issues.push({
            severity: 'error',
            message: `HUD_TOO_LONG: Callout "${h.hud_id ?? h.component}" berisi ${wordCount} kata (maks 8 kata, error > 12 kata)`,
            ref,
          });
        } else if (wordCount > 8) {
          issues.push({
            severity: 'warning',
            message: `HUD_TOO_LONG_WARN: Callout "${h.hud_id ?? h.component}" berisi ${wordCount} kata (disarankan <= 8 kata)`,
            ref,
          });
        }
      }
      if (/\(C\d+\)/.test(propText)) {
        issues.push({
          severity: 'error',
          message: `SB_HUD_CLAIM_ID_LEAK: teks HUD "${propText}" membocorkan ID klaim`,
          ref,
        });
      }
      if (/\b\d{1,3}(?:,\d{3})+\b/.test(propText)) {
        issues.push({
          severity: 'error',
          message: `SB_HUD_FORMAT_NOT_ID: teks HUD "${propText}" memakai pemisah ribuan non-Indonesia`,
          ref,
        });
      }

      const nums = extractNumericValuesFromText(propText);
      const dMin = sbScene.driver ? Math.min(sbScene.driver.from, sbScene.driver.to) : 0;
      const dMax = sbScene.driver ? Math.max(sbScene.driver.from, sbScene.driver.to) : 0;
      const isDriverStat =
        h.component === 'StatCounter' &&
        Boolean(sbScene.driver) &&
        (h.bind_to_driver === true || h.props?.bind_to_driver === true || nums.every((n) => n === 0 || (n >= dMin && n <= dMax)));
      const isDriverBound = Boolean(h.bind_to_driver || h.props?.bind_to_driver || isDriverStat);
      if (isDriverBound) {
        const qty = h.quantity ?? (typeof h.props?.quantity === 'string' ? h.props.quantity : undefined);
        const disp = h.display ?? (h.props?.display === 'qualitative' || h.props?.display === 'value' ? h.props.display : undefined);
        if (!qty || !disp) {
          issues.push({
            severity: 'error',
            message: `L5_DRIVER_LABEL_MISMATCH: HUD driver "${h.hud_id ?? h.component}" wajib mendeklarasikan quantity dan display ("value" | "qualitative")`,
            ref,
          });
        } else {
          const expectedLabel = QUANTITY_LABELS[qty];
          const labelStr = String(h.props?.label ?? h.props?.title ?? '');
          if (
            h.component !== 'EffectiveDiameterCompare' &&
            expectedLabel &&
            !labelStr.toLowerCase().includes(expectedLabel.toLowerCase())
          ) {
            issues.push({
              severity: 'error',
              message: `L5_DRIVER_LABEL_MISMATCH: label "${labelStr}" tidak sesuai besaran "${qty}" (harus menyebut "${expectedLabel}")`,
              ref,
            });
          }
          if (disp === 'value') {
            const hudRefs = getHudClaimRefs(h);
            const hasVerified = hudRefs.some((cid) => claimMap.get(cid)?.status === 'verified');
            if (!hasVerified) {
              issues.push({
                severity: 'error',
                message: `L5_UNSOURCED_DRIVER_VALUE: HUD driver "${h.hud_id ?? h.component}" memakai display="value" tanpa claim_ref verified pendukung`,
                ref,
              });
            }
          }
        }
      }
      if (h.props?.zone === 'caption') {
        issues.push({
          severity: 'error',
          message: `SB_HUD_IN_CAPTION_ZONE: HUD "${h.component}" dilarang menempati zona "caption"`,
          ref,
        });
      }
      if (h.component === 'Callout') {
        const calloutWords = extractHudDisplayText(h.props ?? {})
          .replace(/[—–-]/g, ' ')
          .trim()
          .split(/\s+/)
          .filter(Boolean).length;
        if (calloutWords > 12) {
          issues.push({
            severity: 'error',
            message: `SB_CALLOUT_TOO_LONG: Callout "${h.hud_id ?? h.component}" memiliki ${calloutWords} kata (> 12 kata)`,
            ref,
          });
        } else if (calloutWords > 8) {
          issues.push({
            severity: 'warning',
            message: `SB_CALLOUT_WORD_LIMIT: Callout "${h.hud_id ?? h.component}" memiliki ${calloutWords} kata (> 8 kata)`,
            ref,
          });
        }
      }
      const needsClaim = nums.length > 0 && !isDriverStat && !h.illustrative;
      const claimRefs = getHudClaimRefs(h);

      if (claimRefs.length > 0) {
        const verifiedClaims = [];
        for (const cid of claimRefs) {
          const claim = claimMap.get(cid);
          if (!claim || claim.status !== 'verified') {
            issues.push({
              severity: 'error',
              message: `SB_UNVERIFIED_CLAIM: claim_ref "${cid}" tidak ditemukan atau belum verified`,
              ref,
            });
          } else {
            verifiedClaims.push(claim);
          }
        }
        if (verifiedClaims.length > 0 && nums.length > 0 && !isDriverStat) {
          const allowedNums = new Set<number>();
          for (const claim of verifiedClaims) {
            if (claim.value !== undefined) allowedNums.add(claim.value);
            for (const v of extractNumericValuesFromText(claim.text)) allowedNums.add(v);
            for (const src of claim.sources) {
              for (const v of extractNumericValuesFromText(src.quote)) allowedNums.add(v);
            }
          }
          for (const n of nums) {
            if (![...allowedNums].some((a) => Math.abs(a - n) < 1e-4)) {
              issues.push({
                severity: 'error',
                message: `SB_HUD_NUMBER_NOT_IN_CLAIM: angka ${n} di HUD "${propText}" tidak ada di klaim ${claimRefs.join(', ')}`,
                ref,
              });
            }
          }
        }
      } else if (needsClaim) {
        issues.push({
          severity: 'error',
          message: `SB_HUD_MISSING_CLAIM: HUD "${h.component}" memuat angka (${nums.join(', ')}) tanpa claim_ref/bind_to_driver/illustrative`,
          ref,
        });
      }
    }

    if (sbScene.invariants && sbScene.invariants.length > 0) {
      if (!sbScene.driver) {
        issues.push({ severity: 'error', message: 'SB_INVARIANT_NO_DRIVER: invariants dideklarasikan tanpa driver', ref });
      } else {
        const dMin = Math.min(sbScene.driver.from, sbScene.driver.to);
        const dMax = Math.max(sbScene.driver.from, sbScene.driver.to);
        for (const inv of sbScene.invariants) {
          const [iMin, iMax] = inv.when.driver_between;
          if (iMax < dMin || iMin > dMax) {
            issues.push({
              severity: 'error',
              message: `SB_INVARIANT_OUT_OF_RANGE: rentang [${iMin},${iMax}] di luar driver [${dMin},${dMax}]`,
              ref,
            });
          }
        }
      }
    }
  }

  for (const s of storyboard.scenes) {
    if (
      s.shot_type === 'cross_section' &&
      !s.focus_entities.includes('rail_cross_section') &&
      !s.focus_entities.includes('piston_crank')
    ) {
      issues.push({
        severity: 'error',
        message: `SHOT_VIEW_MISMATCH: shot_type="cross_section" wajib memakai rail_cross_section / view="section" (bukan ${s.focus_entities.join(',')})`,
        ref: s.id,
      });
    }
    if (
      s.shot_type === 'establishing' &&
      !s.focus_entities.includes('train_car') &&
      !s.focus_entities.includes('engine_block')
    ) {
      issues.push({
        severity: 'error',
        message: `SHOT_VIEW_MISMATCH: shot_type="establishing" wajib menampilkan objek konteks (train_car atau engine_block), bukan ${s.focus_entities.join(',')}`,
        ref: s.id,
      });
    }
  }

  const shotTypes = storyboard.scenes.map((s) => s.shot_type).filter(Boolean);
  if (storyboard.scenes.length >= 3 && new Set(shotTypes).size < 3) {
    issues.push({
      severity: 'error',
      message: `SB_LOW_SHOT_VARIETY: hanya ${new Set(shotTypes).size} jenis shot_type berbeda (minimal 3 per video)`,
      ref: 'storyboard',
    });
  }
  for (let i = 1; i < storyboard.scenes.length; i++) {
    const prev = storyboard.scenes[i - 1]!;
    const cur = storyboard.scenes[i]!;
    if (
      prev.shot_type &&
      cur.shot_type &&
      prev.shot_type === cur.shot_type &&
      prev.focus_entities.join(',') === cur.focus_entities.join(',')
    ) {
      issues.push({
        severity: 'error',
        message: `SB_CONSECUTIVE_DUPLICATE_SHOT: ${prev.id} dan ${cur.id} memakai shot_type (${cur.shot_type}) dan focus_entities (${cur.focus_entities.join(',')}) yang sama berturut-turut`,
        ref: cur.id,
      });
    }
  }

  return { layer: 'L4', issues };
}
