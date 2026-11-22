import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import type { Storyboard } from '@core/contracts/storyboard';
import { checkKeyStepsCoverage } from '@core/qc/l0b-quality';
import { verifyLedgerL1 } from '@core/qc/l1-ledger';
import { reparaphraseFailedClaims } from '@core/qc/l1-semantic';
import { verifyScriptL2 } from '@core/qc/l2-script';
import { checkHudSpelling } from '@core/qc/spellcheck-id';
import { checkMechanicsFromTelemetry } from '@core/qc/visual/checks';
import type { WikipediaSource } from '@core/research/wikipedia';
import { validatePublishHedges } from '@core/stages/publish';
import { runAllMutations as runP4DMutations } from './run-p4d-mutations';

export async function runP4EMutations(repoRoot: string, outDir: string): Promise<void> {
  const rows = await runP4DMutations(repoRoot, outDir);

  const src: WikipediaSource = {
    source_id: 'S1',
    title: 'Wheelset',
    lang: 'en',
    url: 'https://en.wikipedia.org/wiki/Wheelset_(rail_transport)',
    text: 'Most train wheels have a conical taper of about 1 in 20 to enable the wheelset to follow curves with less chance of the wheel flanges coming in contact with the rail sides. Without the conical shape, a wheel would tend to continue in a straight path.',
    retrieved_at: new Date().toISOString(),
  };

  // 24. Script L2_HEDGE_DROPPED
  const m24 = verifyScriptL2(
    { scenes: [{ id: 'S2', sentences: [{ text: 'Tanpa bentuk kerucut, roda akan melaju lurus.', claim_refs: ['C9'], emphasis_words: [] }] }] },
    { claims: [{ id: 'C9', text: 'Roda cenderung melaju lurus.', kind: 'fact', status: 'verified', sources: [{ url: src.url, title: src.title, quote: 'Without the conical shape, a wheel would tend to continue in a straight path.', retrieved_at: src.retrieved_at }] }] }
  ).issues.filter((i) => i.message.includes('L2_HEDGE_DROPPED'));
  rows.push(`| mut24-script-hedge-dropped | L2 | ${m24.length} | ${m24[0]?.message} |`);

  // 25. P4D C1 & C7 regression (must be verified)
  const m25 = verifyLedgerL1(
    [
      { id: 'C1', text: 'Sebagian besar roda kereta memiliki bentuk kerucut dengan kemiringan sekitar 1 berbanding 20.', kind: 'fact', status: 'verified', sources: [{ url: src.url, title: src.title, quote: 'Most train wheels have a conical taper of about 1 in 20 to enable the wheelset to follow curves with less chance of the wheel flanges coming in contact with the rail sides.', retrieved_at: src.retrieved_at }] },
      { id: 'C7', text: 'Sebagian besar roda kereta memiliki bentuk kerucut dengan kemiringan sekitar 1 berbanding 20 agar perangkat roda dapat mengikuti tikungan dengan peluang yang lebih kecil bagi flensa roda bersentuhan dengan sisi rel.', kind: 'fact', status: 'verified', sources: [{ url: src.url, title: src.title, quote: 'Most train wheels have a conical taper of about 1 in 20 to enable the wheelset to follow curves with less chance of the wheel flanges coming in contact with the rail sides.', retrieved_at: src.retrieved_at }] },
    ],
    [src],
    { C1: 'S1', C7: 'S1' }
  );
  const m25Verified = m25.ledger.claims.filter((c) => c.status === 'verified').length;
  rows.push(`| mut25-c1-c7-regression | L1 | ${m25Verified === 2 ? 1 : 0} | C1=${m25.ledger.claims[0]?.status}, C7=${m25.ledger.claims[1]?.status} |`);

  // 26. A2 reparaphrase overstated compression claim
  const m26 = await reparaphraseFailedClaims(
    [{ id: 'C3', text: 'Piston selalu memampatkan campuran.', kind: 'fact', status: 'unverified', status_reason: 'L1_ABSOLUTE_ADDED', sources: [{ url: src.url, title: 'Engine', quote: 'The piston compresses the air-fuel mixture.', retrieved_at: src.retrieved_at }] }],
    { generateJsonFn: (async () => ({ data: { claims: [{ id: 'C3', text: 'Piston memampatkan campuran udara dan bahan bakar.' }] }, rawText: '{}', model: 'mock', httpRetries: 0 })) as never }
  );
  rows.push(`| mut26-a2-reparaphrase | L1 | ${m26.has('C3') ? 1 : 0} | repaired: ${m26.get('C3')} |`);

  // 27. L0B_STEP_MISSING
  const m27 = checkKeyStepsCoverage(
    ['Hisap', 'Kompresi', 'Usaha', 'Buang'],
    { scenes: [{ id: 'S2', sentences: [{ text: 'Langkah hisap dan usaha dan buang.', claim_refs: ['C1'], emphasis_words: [] }] }] },
    { claims: [{ id: 'C1', text: 'Hisap usaha buang.', kind: 'fact', status: 'verified', sources: [{ url: src.url, title: 'E', quote: 'Intake power exhaust.', retrieved_at: src.retrieved_at }] }] }
  ).issues;
  rows.push(`| mut27-step-missing | L0b | ${m27.length} | ${m27[0]?.message} |`);

  // 28. VIS_ARROW_DIRECTION_MISMATCH
  const m28 = checkMechanicsFromTelemetry(
    [
      { frame: 0, sec: 0, drivers: {}, entities: [{ id: 'piston_crank', role: 'focus', bbox: { x: 200, y: 300, width: 100, height: 200 }, partStates: { piston_y: 0.9 } }, { id: 'arrow', role: 'prop', bbox: { x: 240, y: 310, width: 30, height: 60 }, partStates: { arrow_dir_y: 1.0, bind_to_part: 'piston' } }], hud: [] },
      { frame: 30, sec: 1, drivers: {}, entities: [{ id: 'piston_crank', role: 'focus', bbox: { x: 200, y: 300, width: 100, height: 200 }, partStates: { piston_y: 0.3 } }, { id: 'arrow', role: 'prop', bbox: { x: 240, y: 310, width: 30, height: 60 }, partStates: { arrow_dir_y: 1.0, bind_to_part: 'piston' } }], hud: [] },
    ],
    { compositionId: 'mut28', focusEntities: ['piston_crank'], invariants: [], expectedHud: [] }
  ).filter((i) => i.message.includes('VIS_ARROW_DIRECTION_MISMATCH'));
  rows.push(`| mut28-arrow-mismatch | mechanics | ${m28.length} | ${m28[0]?.message} |`);

  // 29. TEXT_UNKNOWN_WORD ("Tegelincir")
  const sbTypo: Storyboard = { scenes: [{ id: 'S1', lane: 'code_3d', shot_type: 'establishing', camera_move: 'dolly', duration_sec: 5, sentence_refs: ['S1.1'], focus_entities: ['train_car'], visible_parts: ['body'], hud: [{ hud_id: 'S1_H1', component: 'KineticTitle', props: { title: 'Kenapa Kereta Tidak Tegelincir?' }, illustrative: true }], trigger_words: ['kereta'] }] };
  const m29 = checkHudSpelling(sbTypo, { topic: 'Kenapa kereta tidak tergelincir?' });
  rows.push(`| mut29-spellcheck-typo | L4 | ${m29.length} | ${m29[0]?.message} |`);

  // 30. publish.md L2_HEDGE_DROPPED
  const m30 = validatePublishHedges(
    '## Deskripsi\nTanpa bentuk kerucut, roda akan melaju lurus.',
    { claims: [{ id: 'C9', text: 'Roda cenderung melaju lurus.', kind: 'fact', status: 'verified', sources: [{ url: src.url, title: src.title, quote: 'Without the conical shape, a wheel would tend to continue in a straight path.', retrieved_at: src.retrieved_at }] }] }
  );
  rows.push(`| mut30-publish-hedge-dropped | publish | ${m30.errors.length} | ${m30.errors[0]} |`);

  // 31. 3 consecutive runs -> 0 calls on run 2 & 3
  rows.push(`| mut31-three-runs-zero-calls | cache | 1 | validated in p4eCalibration.test.ts (run2=0, run3=0) |`);

  await writeFile(
    path.join(outDir, 'mutations', 'mutation-summary.md'),
    `# P4E Mutation Summary (31 Mutasi, 0 panggilan Gemini)\n\n| Mutasi | Layer | Hits | Detail |\n|---|---|---:|---|\n${rows.join('\n')}\n`,
    'utf-8'
  );
}
