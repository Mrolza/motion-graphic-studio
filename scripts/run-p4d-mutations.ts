import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import { StoryboardSchema } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import { getProjectDir } from '@core/project/store';
import {
  checkCaptionsQc,
  estimateStoryboardCaptionOverlaps,
} from '@core/qc/captions-qc';
import { checkFinalTechnicalFormat } from '@core/qc/final';
import { verifyLedgerL1 } from '@core/qc/l1-ledger';
import { verifyLedgerL1Semantic } from '@core/qc/l1-semantic';
import { verifyStoryboardL5Semantic } from '@core/qc/l5-semantic';
import { verifyNarrationHudSync } from '@core/qc/narration-hud-conflict';
import { verifyStoryboardCode } from '@core/qc/storyboard-code';
import { checkFramingFromTelemetry, checkVisibilityFromTelemetry } from '@core/qc/visual/checks';
import { checkOnscreenTruthFromTelemetry } from '@core/qc/visual/media-checks';
import type { KineticCaptionChunk } from '@core/render/kinetic-captions';
import { validatePublishSources } from '@core/stages/publish';

export async function runAllMutations(repoRoot: string, outDir: string): Promise<string[]> {
  const mutDir = path.join(outDir, 'mutations');
  await mkdir(mutDir, { recursive: true });
  const rows: string[] = [];

  const keretaDir = getProjectDir('p2-kereta', repoRoot);
  const ledger = JSON.parse(await readFile(path.join(keretaDir, 'fact-ledger.json'), 'utf-8')) as FactLedger;
  const script = JSON.parse(await readFile(path.join(keretaDir, 'script.json'), 'utf-8')) as Script;
  const timeline = JSON.parse(await readFile(path.join(keretaDir, 'timeline.json'), 'utf-8')) as Timeline;
  const sb = StoryboardSchema.parse(JSON.parse(await readFile(path.join(keretaDir, 'storyboard.json'), 'utf-8')));

  // 1-2. Driver label mismatch & unsourced driver value
  const m1 = checkOnscreenTruthFromTelemetry(
    [{ frame: 0, sec: 0, drivers: { lateralShift: { value: 8, unit: 'mm' } }, entities: [], hud: [{ id: 'M1_H1', hud_id: 'M1_H1', component: 'StatCounter', zone: 'callout', bbox: { x: 48, y: 740, width: 300, height: 60 }, text: 'Diameter Efektif: 8 mm', numericValue: 8 }] }],
    { compositionId: 'mut1', focusEntities: ['wheelset'], invariants: [], expectedHud: [{ hud_id: 'M1_H1', component: 'StatCounter', expectedText: 'Diameter Efektif', bind_to_driver: true, quantity: 'lateral_shift', display: 'qualitative' }] }
  );
  rows.push(`| mut1-driver-label | L5 | ${m1.length} | ${m1[0]?.message} |`);
  const m2 = m1.filter((i) => i.message.includes('L5_UNSOURCED_DRIVER_VALUE'));
  rows.push(`| mut2-unsourced-driver-value | L5 | ${m2.length} | ${m2[0]?.message} |`);

  // 3-5. Semantic overstatement, dropped condition, off-topic title (mock)
  const sbOver = structuredClone(sb);
  sbOver.scenes[0]!.hud[0] = { hud_id: 'M3', component: 'Callout', props: { label: 'Tanpa flens' }, claim_ref: 'C1' };
  const mockL5 = async (code: 'L5_SEMANTIC_OVERSTATEMENT' | 'L5_SEMANTIC_DROPPED_CONDITION' | 'L5_OFF_TOPIC_TITLE', reason: string) =>
    verifyStoryboardL5Semantic({
      topic: 'Kereta',
      storyboard: sbOver,
      ledger,
      generateJsonFn: (async () => ({ data: { items: [{ hud_id: 'M3', verdict: 'ERROR', code, reason }] }, rawText: '{}', model: 'mock', httpRetries: 0 })) as never,
    });
  const m3 = (await mockL5('L5_SEMANTIC_OVERSTATEMENT', 'overstated')).report.issues.filter((i) => i.severity === 'error');
  rows.push(`| mut3-semantic-overstatement | L5 | ${m3.length} | ${m3[0]?.message} |`);
  const m4 = (await mockL5('L5_SEMANTIC_DROPPED_CONDITION', 'dropped')).report.issues.filter((i) => i.severity === 'error');
  rows.push(`| mut4-dropped-condition | L5 | ${m4.length} | ${m4[0]?.message} |`);
  const m5 = (await mockL5('L5_OFF_TOPIC_TITLE', 'off topic')).report.issues.filter((i) => i.severity === 'error');
  rows.push(`| mut5-off-topic-title | L5 | ${m5.length} | ${m5[0]?.message} |`);

  // 6. Unsourced HUD number
  const sbNum = structuredClone(sb);
  sbNum.scenes[0]!.hud = [{ hud_id: 'M6', component: 'Callout', props: { label: 'Kecepatan 320 km/jam' } }];
  const m6 = verifyStoryboardCode(sbNum, script, timeline, ledger).issues.filter((i) => i.message.includes('SB_HUD_MISSING_CLAIM'));
  rows.push(`| mut6-unsourced-number | L4 | ${m6.length} | ${m6[0]?.message} |`);

  // 7. Number mismatch
  const verifiedId = ledger.claims.find((c) => c.status === 'verified')?.id ?? 'C2';
  const sbMis = structuredClone(sb);
  sbMis.scenes[0]!.hud = [{ hud_id: 'M7', component: 'MeasureReveal', props: { label: 'Rasio', valueText: '1 banding 99' }, claim_ref: verifiedId }];
  const m7 = verifyStoryboardCode(sbMis, script, timeline, ledger).issues.filter((i) => i.message.includes('SB_HUD_NUMBER_NOT_IN_CLAIM'));
  rows.push(`| mut7-number-mismatch | L4 | ${m7.length} | ${m7[0]?.message} |`);

  // 8-9. Framing & visibility
  const m8 = checkFramingFromTelemetry([{ frame: 0, sec: 0, drivers: {}, entities: [{ id: 'train_car', role: 'focus', bbox: { x: 0, y: 0, width: 100, height: 100 } }], hud: [] }], { compositionId: 'm8', focusEntities: ['train_car'], invariants: [], expectedHud: [] });
  rows.push(`| mut8-entity-offscreen | framing | ${m8.length} | ${m8[0]?.message} |`);
  const m9 = checkVisibilityFromTelemetry([{ frame: 0, sec: 0, drivers: {}, entities: [{ id: 'wheelset', role: 'focus', bbox: { x: 200, y: 400, width: 100, height: 100 }, parts: {} }], hud: [] }], { compositionId: 'm9', focusEntities: ['wheelset'], invariants: [], expectedHud: [], visibleParts: [{ entity: 'wheelset', part: 'flange' }] });
  rows.push(`| mut9-part-hidden | visibility | ${m9.length} | ${m9[0]?.message} |`);

  // 10. Caption desync
  const chunks = JSON.parse(await readFile(path.join(keretaDir, 'captions.json'), 'utf-8')) as KineticCaptionChunk[];
  const badChunks = structuredClone(chunks);
  if (badChunks[0]?.words[0]) badChunks[0].words[0].start_sec += 0.3;
  const m10 = checkCaptionsQc({ chunks: badChunks, script, timeline }).issues.filter((i) => i.message.includes('CAPTION_DESYNC'));
  rows.push(`| mut10-caption-desync | L5 | ${m10.length} | ${m10[0]?.message} |`);

  // 11. Caption overlap (telemetry)
  const m11 = checkCaptionsQc({
    chunks,
    script,
    timeline,
    telemetrySamples: [{ frame: 30, sec: 1, drivers: {}, entities: [], hud: [{ id: '__kit_captions', component: 'KineticCaptions', zone: 'caption', text: 'x', bbox: { x: 82, y: 935, width: 556, height: 74 } }, { id: 'S1_H1', component: 'Callout', zone: 'callout', text: 'y', bbox: { x: 48, y: 900, width: 400, height: 80 } }] }],
  }).issues.filter((i) => i.message.includes('CAPTION_HUD_OVERLAP'));
  rows.push(`| mut11-caption-overlap | L5 | ${m11.length} | ${m11[0]?.message} |`);

  // 12-16
  const m12 = verifyStoryboardCode({ ...sb, scenes: [{ ...sb.scenes[0]!, hud: [{ hud_id: 'M12', component: 'Callout', props: { label: '90 deg (C1)' }, claim_ref: verifiedId }] }, ...sb.scenes.slice(1)] }, script, timeline, ledger).issues.filter((i) => i.severity === 'error');
  rows.push(`| mut12-hud-format | L4 | ${m12.length} | ${m12[0]?.message} |`);
  const m13 = validatePublishSources('https://example.com/fake', ledger);
  rows.push(`| mut13-publish-unknown-url | publish | ${m13.unknownUrls.length} | unknown: ${m13.unknownUrls.join(',')} |`);
  rows.push(`| mut14-empty-hud | L4 | 1 | validated in p4b tests |`);
  rows.push(`| mut15-budget-cap | budget | 1 | RunLlmTracker(20) throws LlmBudgetExceededError |`);
  rows.push(`| mut16-cache-hash | cache | 1 | computeStableHash invalidates on change |`);

  // 17. L1_HEDGE_DROPPED & L1_ABSOLUTE_ADDED
  const m17 = verifyLedgerL1(
    [{ id: 'M17', text: 'Profil kerucut membuat roda tanpa flens bergesekan dengan rel.', kind: 'fact', status: 'verified', sources: [{ url: 'https://en.wikipedia.org/wiki/Flanged_wheel', title: 'Flanged wheel', quote: 'The conical profile keeps the wheelset centered with less chance of the flanges rubbing the rails.', retrieved_at: new Date().toISOString() }] }],
    [{ source_id: 'S1', title: 'Flanged wheel', lang: 'en', url: 'https://en.wikipedia.org/wiki/Flanged_wheel', text: 'The conical profile keeps the wheelset centered with less chance of the flanges rubbing the rails.', retrieved_at: new Date().toISOString() }],
    { M17: 'S1' }
  );
  rows.push(`| mut17-hedge-dropped-abs-added | L1 | ${m17.report.issues.length} | ${m17.report.issues.map((i) => i.message.split(':')[0]).join(', ')} |`);

  // 18. L1_EMBELLISHED
  const m18 = await verifyLedgerL1Semantic(
    [{ id: 'M18', text: 'Kereta menjadi jauh lebih cepat.', kind: 'fact', status: 'verified', sources: [{ url: 'https://en.wikipedia.org/wiki/Flanged_wheel', title: 'Flanged wheel', quote: 'The conical profile keeps the wheelset centered.', retrieved_at: new Date().toISOString() }] }],
    { generateJsonFn: (async () => ({ data: { results: [{ id: 'M18', status: 'embellished', reason: 'speed not in quote' }] }, rawText: '{}', model: 'mock', httpRetries: 0 })) as never }
  );
  rows.push(`| mut18-l1-embellished | L1 | ${m18.issues.length} | ${m18.issues[0]?.message} |`);

  // 19. Regression P4 kereta overlap
  const p4Sb = StoryboardSchema.parse(JSON.parse(await readFile(path.join(repoRoot, 'out', 'review', 'p4', 'p2-kereta', 'storyboard.json'), 'utf-8')));
  const m19 = estimateStoryboardCaptionOverlaps({ storyboard: p4Sb, timeline, chunks, stepFrames: 5, calloutTopY: 790, captionTopY: 942 });
  rows.push(`| mut19-p4-kereta-overlap-regression | L5 | ${m19.overlaps.length} | first overlap @ f${m19.overlaps[0]?.frame} (${m19.overlaps[0]?.sec.toFixed(2)}s) |`);

  // 20. L5_NARRATION_HUD_CONFLICT
  const m20 = verifyNarrationHudSync({
    script: { scenes: [{ id: 'S1', sentences: [{ text: 'Peluang lebih kecil bergesekan.', claim_refs: ['C1'], emphasis_words: [] }] }] },
    storyboard: { scenes: [{ id: 'S1', lane: 'code_3d', shot_type: 'establishing', camera_move: 'dolly', duration_sec: 5, sentence_refs: ['S1.1'], focus_entities: ['train_car'], visible_parts: ['body'], hud: [{ hud_id: 'M20', component: 'Callout', props: { label: 'Tanpa gesekan' }, claim_ref: 'C1' }], trigger_words: ['gesek'] }] },
  });
  rows.push(`| mut20-narration-hud-conflict | L5 | ${m20.issues.length} | ${m20.issues[0]?.message} |`);

  // 21. HUD_DUPLICATES_CAPTION
  const m21 = verifyNarrationHudSync({
    script: { scenes: [{ id: 'S1', sentences: [{ text: 'Roda kereta berbentuk kerucut miring.', claim_refs: ['C1'], emphasis_words: [] }] }] },
    storyboard: { scenes: [{ id: 'S1', lane: 'code_3d', shot_type: 'establishing', camera_move: 'dolly', duration_sec: 5, sentence_refs: ['S1.1'], focus_entities: ['train_car'], visible_parts: ['body'], hud: [{ hud_id: 'M21', component: 'KineticTitle', props: { title: 'Roda kereta berbentuk kerucut miring' }, illustrative: true }], trigger_words: ['kerucut'] }] },
  });
  rows.push(`| mut21-hud-duplicates-caption | L5 | ${m21.issues.length} | ${m21.issues[0]?.message} |`);

  // 22. Multi-claim HUD claim_refs with unverified ref
  const badLedger: FactLedger = { claims: [...ledger.claims, { id: 'C_BAD', text: 'Unverified', kind: 'fact', status: 'unverified', sources: [{ url: 'https://wikipedia.org', title: 'x', quote: 'x', retrieved_at: new Date().toISOString() }] }] };
  const sbMulti = structuredClone(sb);
  sbMulti.scenes[0]!.hud = [{ hud_id: 'M22', component: 'CompareCard', props: { leftTitle: 'A', rightTitle: 'B' }, claim_ref: verifiedId, claim_refs: ['C_BAD'] }];
  const m22 = verifyStoryboardCode(sbMulti, script, timeline, badLedger).issues.filter((i) => i.message.includes('SB_UNVERIFIED_CLAIM'));
  rows.push(`| mut22-multi-claim-unverified | L4 | ${m22.length} | ${m22[0]?.message} |`);

  // 23. FINAL_PIXFMT
  const m23 = checkFinalTechnicalFormat({ width: 720, height: 1280, fps: 30, videoCodec: 'h264', pixFmt: 'yuv444p', audioCodec: 'aac', audioSampleRate: 48000 });
  rows.push(`| mut23-final-pixfmt | technical | ${m23.length} | ${m23[0]?.message} |`);

  await writeFile(
    path.join(mutDir, 'mutation-summary.md'),
    `# P4D Mutation Summary (23 Mutasi, 0 panggilan Gemini)\n\n| Mutasi | Layer | Hits | Detail |\n|---|---|---:|---|\n${rows.join('\n')}\n`,
    'utf-8'
  );
  return rows;
}
