import type { QcIssue } from '@core/contracts/qc-report';
import type { Storyboard } from '@core/contracts/storyboard';
import {
  domainHasSectionView,
  getAvailableShotsForDomain,
  isComponentAllowedInDomain,
  isEntityAllowedInDomain,
  type KitDomain,
} from '@core/kit/domain-registry';

export function checkStoryboardDomainAndShots(
  storyboard: Storyboard,
  domain?: KitDomain
): QcIssue[] {
  const issues: QcIssue[] = [];

  for (const s of storyboard.scenes) {
    if (domain) {
      for (const ent of s.focus_entities) {
        if (!isEntityAllowedInDomain(ent, domain)) {
          issues.push({
            severity: 'error',
            message: `SB_ENTITY_OFF_TOPIC: entitas "${ent}" berada di luar domain topik "${domain}"`,
            ref: s.id,
          });
        }
      }
      for (const h of s.hud) {
        if (!isComponentAllowedInDomain(h.component, domain)) {
          issues.push({
            severity: 'error',
            message: `SB_ENTITY_OFF_TOPIC: komponen HUD "${h.component}" berada di luar domain topik "${domain}"`,
            ref: s.id,
          });
        }
      }
    }

    if (s.shot_type === 'cross_section') {
      if (domain && !domainHasSectionView(domain)) {
        issues.push({
          severity: 'error',
          message: `SHOT_VIEW_MISMATCH: domain "${domain}" tidak memiliki komponen berjenis view="section"`,
          ref: s.id,
        });
      } else if (domain === 'engine' && !s.focus_entities.includes('cylinder_section')) {
        issues.push({
          severity: 'error',
          message: `SHOT_VIEW_MISMATCH: shot_type="cross_section" pada domain engine wajib memakai cylinder_section (bukan ${s.focus_entities.join(',')})`,
          ref: s.id,
        });
      } else if (domain === 'rail' && !s.focus_entities.includes('rail_cross_section')) {
        issues.push({
          severity: 'error',
          message: `SHOT_VIEW_MISMATCH: shot_type="cross_section" pada domain rail wajib memakai rail_cross_section (bukan ${s.focus_entities.join(',')})`,
          ref: s.id,
        });
      } else if (
        !domain &&
        !s.focus_entities.includes('rail_cross_section') &&
        !s.focus_entities.includes('cylinder_section') &&
        !s.focus_entities.includes('piston_crank')
      ) {
        issues.push({
          severity: 'error',
          message: `SHOT_VIEW_MISMATCH: shot_type="cross_section" wajib memakai rail_cross_section / cylinder_section / view="section" (bukan ${s.focus_entities.join(',')})`,
          ref: s.id,
        });
      }
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

  const availableShots = domain ? getAvailableShotsForDomain(domain) : null;
  const shotTypes = storyboard.scenes
    .map((s) => s.shot_type)
    .filter((st): st is NonNullable<typeof st> => Boolean(st && (!availableShots || availableShots.includes(st))));
  const minRequired = availableShots ? Math.min(3, availableShots.length) : 3;
  if (storyboard.scenes.length >= minRequired && new Set(shotTypes).size < minRequired) {
    issues.push({
      severity: 'error',
      message: `SB_LOW_SHOT_VARIETY: hanya ${new Set(shotTypes).size} jenis shot_type tersedia berbeda (minimal ${minRequired} per video)`,
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

  return issues;
}
