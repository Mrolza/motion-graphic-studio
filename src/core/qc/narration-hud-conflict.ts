import type { QcIssue, QcReport } from '@core/contracts/qc-report';
import type { Script } from '@core/contracts/script';
import { getHudClaimRefs, type Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { findAbsoluteTermsId, findHedgeTermsId } from '@core/qc/hedge-glossary';
import { extractHudDisplayText } from '@core/qc/l5-semantic';

export interface CaptionChunkLike {
  id: string;
  start_sec: number;
  end_sec: number;
  lines?: string[];
  words?: Array<{ text: string; start_sec?: number; end_sec?: number }>;
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function wordOverlapRatio(hudWords: string[], captionWords: string[]): number {
  if (hudWords.length === 0 || captionWords.length === 0) return 0;
  const capSet = new Set(captionWords);
  let matched = 0;
  for (const w of hudWords) {
    if (capSet.has(w)) matched++;
  }
  return matched / hudWords.length;
}

/**
 * Checks B3 (L5_NARRATION_HUD_CONFLICT) and B4 (HUD_DUPLICATES_CAPTION).
 */
export function verifyNarrationHudSync(params: {
  script: Script;
  storyboard: Storyboard;
  timeline?: Timeline;
  captions?: CaptionChunkLike[];
}): QcReport {
  const { script, storyboard, timeline, captions } = params;
  const issues: QcIssue[] = [];

  const scriptSceneMap = new Map(script.scenes.map((s) => [s.id, s]));
  const timelineSceneMap = new Map(timeline?.scenes.map((s) => [s.scene_id, s]) ?? []);

  for (const sbScene of storyboard.scenes) {
    const scScene = scriptSceneMap.get(sbScene.id);
    const tlScene = timelineSceneMap.get(sbScene.id);
    const sentences = scScene?.sentences ?? [];

    for (let idx = 0; idx < sbScene.hud.length; idx++) {
      const h = sbScene.hud[idx]!;
      const hid = h.hud_id ?? `${sbScene.id}_H${idx + 1}`;
      const hudText = extractHudDisplayText(h.props ?? {});
      if (!hudText) continue;

      const hudClaims = new Set(getHudClaimRefs(h));
      const hudAbs = findAbsoluteTermsId(hudText);
      const hudHedge = findHedgeTermsId(hudText);

      // B3: L5_NARRATION_HUD_CONFLICT
      if (hudClaims.size > 0) {
        for (const sent of sentences) {
          const sharesClaim = sent.claim_refs.some((cid) => hudClaims.has(cid));
          if (!sharesClaim) continue;
          const sentAbs = findAbsoluteTermsId(sent.text);
          const sentHedge = findHedgeTermsId(sent.text);
          if ((hudAbs.length > 0 && sentHedge.length > 0) || (sentAbs.length > 0 && hudHedge.length > 0)) {
            issues.push({
              severity: 'error',
              message: `L5_NARRATION_HUD_CONFLICT: HUD "${hid}" ("${hudText}") dan narasi "${sent.text}" merujuk klaim sama (${[...hudClaims].join(', ')}) dengan kontradiksi mutlak vs hedge`,
              ref: `${sbScene.id}:${hid}`,
            });
          }
        }
      }

      // B4: HUD_DUPLICATES_CAPTION
      if (h.component === 'KineticTitle' || h.component === 'Callout') {
        const hudWords = normalizeWords(hudText);
        if (hudWords.length >= 2) {
          if (captions && captions.length > 0 && tlScene) {
            const activeCaptions = captions.filter(
              (c) => c.end_sec >= tlScene.start && c.start_sec <= tlScene.end
            );
            const combinedCapWords = activeCaptions.flatMap((c) => {
              const txt = c.words?.map((w) => w.text).join(' ') ?? c.lines?.join(' ') ?? '';
              return normalizeWords(txt);
            });
            const ratio = wordOverlapRatio(hudWords, combinedCapWords);
            if (ratio >= 0.7) {
              issues.push({
                severity: 'warning',
                message: `HUD_DUPLICATES_CAPTION: ${h.component} "${hid}" berbagi ${Math.round(ratio * 100)}% kata dengan caption simultan`,
                ref: `${sbScene.id}:${hid}`,
              });
            }
          } else if (sentences.length > 0) {
            const sentWords = sentences.flatMap((s) => normalizeWords(s.text));
            const ratio = wordOverlapRatio(hudWords, sentWords);
            if (ratio >= 0.7) {
              issues.push({
                severity: 'warning',
                message: `HUD_DUPLICATES_CAPTION: ${h.component} "${hid}" berbagi ${Math.round(ratio * 100)}% kata dengan narasi/caption`,
                ref: `${sbScene.id}:${hid}`,
              });
            }
          }
        }
      }
    }
  }

  return {
    layer: 'L5',
    issues,
  };
}
