import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Project } from '@core/contracts/project';
import type { Script } from '@core/contracts/script';
import { editScriptSentences } from '@core/qc/edit-script';
import { validateGate1Approval } from '@core/qc/gate1-check';
import { checkScriptClarity } from '@core/qc/l0b-clarity';
import { scoreQuoteClarity } from '@core/research/quote-scorer';
import { runVoiceStage } from '@core/stages/voice';
import { runP4FMutations } from './run-p4f-mutations';

export async function runP4GMutations(repoRoot: string, outDir: string): Promise<void> {
  await mkdir(path.join(outDir, 'mutations'), { recursive: true });
  await runP4FMutations(repoRoot, outDir);
  const summaryPath = path.join(outDir, 'mutations', 'mutation-summary.md');
  const existing = await readFile(summaryPath, 'utf-8');
  const rows: string[] = [];

  const dummySrc = {
    url: 'https://en.wikipedia.org/wiki/Four-stroke_engine',
    title: 'Four-stroke engine',
    quote: 'The power stroke produces mechanical work.',
    retrieved_at: new Date().toISOString(),
  };

  // 40. "Langkah tersebut menghasilkan kerja mekanis..." -> L0B_STEP_UNNAMED / L0B_DANGLING_REFERENCE
  const ledger40: FactLedger = {
    claims: [{ id: 'C3', text: 'Langkah usaha menghasilkan kerja mekanis.', kind: 'fact', status: 'verified', step_id: 'Usaha', sources: [dummySrc] }],
  };
  const script40: Script = {
    scenes: [{ id: 'S2', sentences: [{ text: 'Langkah tersebut menghasilkan kerja mekanis untuk memutar poros.', claim_refs: ['C3'], emphasis_words: ['kerja'], non_factual: false }] }],
  };
  const m40 = checkScriptClarity(script40, { keySteps: ['Hisap', 'Kompresi', 'Usaha', 'Buang'], ledger: ledger40 });
  rows.push(`| mut40-step-unnamed-dangling | L0b | ${m40.length} | ${m40.map((i) => i.message.split(':')[0]).join(' + ')} |`);

  // 41. "piston bergerak dari satu titik ke titik lain" -> L0B_VAGUE_PHRASE
  const script41: Script = {
    scenes: [{ id: 'S2', sentences: [{ text: 'Saat hisap, piston bergerak dari satu titik ke titik lain.', claim_refs: [], emphasis_words: ['piston'], non_factual: true }] }],
  };
  const m41 = checkScriptClarity(script41).filter((i) => i.message.includes('L0B_VAGUE_PHRASE'));
  rows.push(`| mut41-vague-phrase | L0b | ${m41.length} | ${m41[0]?.message} |`);

  // 42. Kutipan kontradiktif "heads downwards... (B.D.C. to T.D.C.)" kalah dari kutipan konsisten
  const badQ = scoreQuoteClarity('The piston heads downwards as it travels from B.D.C. to T.D.C. (assuming ideal cycle).');
  const goodQ = scoreQuoteClarity('During the intake stroke, the piston moves downward from TDC to BDC.');
  rows.push(`| mut42-contradictory-quote | research | ${badQ.score < goodQ.score ? 1 : 0} | bad=${badQ.score} (${badQ.penalties.join(', ')}) < good=${goodQ.score} |`);

  // 43. Suntingan pemilik membuang kata lunak -> L2_HEDGE_DROPPED, approve ditolak
  const tmp43 = await mkdtemp(path.join(os.tmpdir(), 'mgs-mut43-'));
  try {
    const id = 'mut43';
    const dir43 = path.join(tmp43, 'projects', id);
    await mkdir(path.join(dir43, 'qc'), { recursive: true });
    const proj43: Project = {
      id, topic: 'Mesin 4 tak', format: 'how_it_works', style: 'blueprint',
      palette: 'blueprint_dark', device_profile: 'hemat', target_duration_sec: 35,
      created_at: new Date().toISOString(),
      stages: { S1: 'done', S2: 'done', S3: 'done', S4: 'needs_review', S5: 'pending', S6: 'pending', S7: 'pending', S8: 'pending', S9: 'pending', S10: 'pending', S11: 'pending', S12: 'pending' },
      llm_calls: {},
    };
    const led43: FactLedger = {
      claims: [{ id: 'C1', text: 'Sebagian besar mesin bensin memakai empat langkah.', kind: 'fact', status: 'verified', sources: [{ ...dummySrc, quote: 'Most gasoline engines use four strokes.' }] }],
    };
    const sc43: Script = {
      scenes: [{ id: 'S1', sentences: [{ text: 'Sebagian besar mesin bensin memakai empat langkah.', claim_refs: ['C1'], emphasis_words: ['empat'], non_factual: false }] }],
    };
    await writeFile(path.join(dir43, 'project.json'), JSON.stringify(proj43, null, 2), 'utf-8');
    await writeFile(path.join(dir43, 'fact-ledger.json'), JSON.stringify(led43, null, 2), 'utf-8');
    await writeFile(path.join(dir43, 'script.json'), JSON.stringify(sc43, null, 2), 'utf-8');
    await writeFile(path.join(dir43, 'qc', 'L1.json'), JSON.stringify({ layer: 'L1', issues: [] }), 'utf-8');
    await writeFile(path.join(dir43, 'qc', 'L2.json'), JSON.stringify({ layer: 'L2', issues: [] }), 'utf-8');
    const res43 = await editScriptSentences({
      projectId: id,
      edits: [{ ref: 'S1.1', text: 'Semua mesin bensin selalu memakai empat langkah.' }],
      repoRoot: tmp43,
      generateJsonFn: (async () => ({ data: { evaluations: [{ ref: 'S1.1', verdict: 'supported', reason: 'mock' }] }, usage: { model: 'mock', inputTokens: 0, outputTokens: 0 } })) as unknown as Parameters<typeof editScriptSentences>[0]['generateJsonFn'],
    });
    const gate43 = await validateGate1Approval(dir43);
    const hedgeErr = res43.l2Report.issues.find((i) => i.message.includes('L2_HEDGE_DROPPED'));
    rows.push(`| mut43-edit-drop-hedge | L2+Gate1 | ${hedgeErr && !gate43.approved ? 1 : 0} | ${hedgeErr?.message}; approved=${gate43.approved} |`);
  } finally {
    await rm(tmp43, { recursive: true, force: true });
  }

  // 44. Suntingan 1 kalimat -> hanya kalimat itu yang dibuat ulang TTS-nya
  const tmp44 = await mkdtemp(path.join(os.tmpdir(), 'mgs-mut44-'));
  try {
    const id = 'mut44';
    const dir44 = path.join(tmp44, 'projects', id);
    await mkdir(dir44, { recursive: true });
    const proj44: Project = {
      id, topic: 'Mesin 4 tak', format: 'how_it_works', style: 'blueprint',
      palette: 'blueprint_dark', device_profile: 'hemat', target_duration_sec: 35,
      created_at: new Date().toISOString(),
      stages: { S1: 'done', S2: 'done', S3: 'done', S4: 'done', S5: 'pending', S6: 'pending', S7: 'pending', S8: 'pending', S9: 'pending', S10: 'pending', S11: 'pending', S12: 'pending' },
      llm_calls: {},
    };
    const sc44: Script = {
      scenes: [{ id: 'S1', sentences: [{ text: 'Kalimat satu.', claim_refs: [], emphasis_words: [], non_factual: true }, { text: 'Kalimat dua.', claim_refs: [], emphasis_words: [], non_factual: true }] }],
    };
    await writeFile(path.join(dir44, 'project.json'), JSON.stringify(proj44, null, 2), 'utf-8');
    await writeFile(path.join(dir44, 'script.json'), JSON.stringify(sc44, null, 2), 'utf-8');
    const execFileAsync = promisify(execFile);
    const mockSynth = async (p: { ref: string; text: string; destDisk: string }) => {
      const dur = 0.2 + (p.text.length % 7) * 0.05;
      await execFileAsync(ffmpegInstaller.path, [
        '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
        '-t', dur.toFixed(2), '-q:a', '9', p.destDisk,
      ]);
      return { duration_sec: dur, words: [{ text: 'ok', start: 0.05, end: 0.15 }], engine_used: 'msedge-tts' };
    };
    await runVoiceStage(id, { repoRoot: tmp44, synthesizeSentenceFn: mockSynth, skipTighten: true });
    const man1 = JSON.parse(await readFile(path.join(dir44, 'audio', 'sentences', 'manifest.json'), 'utf-8')) as Record<string, { audio_sha256: string }>;
    sc44.scenes[0]!.sentences[1]!.text = 'Kalimat dua sudah diubah lebih panjang.';
    await writeFile(path.join(dir44, 'script.json'), JSON.stringify(sc44, null, 2), 'utf-8');
    const run2 = await runVoiceStage(id, { repoRoot: tmp44, synthesizeSentenceFn: mockSynth, skipTighten: true });
    const man2 = JSON.parse(await readFile(path.join(dir44, 'audio', 'sentences', 'manifest.json'), 'utf-8')) as Record<string, { audio_sha256: string }>;
    const ok44 = run2.reusedSentenceRefs.join(',') === 'S1.1' && run2.synthesizedSentenceRefs.join(',') === 'S1.2' && man1['S1.1']!.audio_sha256 === man2['S1.1']!.audio_sha256 && man1['S1.2']!.audio_sha256 !== man2['S1.2']!.audio_sha256;
    rows.push(`| mut44-tts-incremental | S5 | ${ok44 ? 1 : 0} | reused=[${run2.reusedSentenceRefs}], synth=[${run2.synthesizedSentenceRefs}], S1.1 hash preserved |`);
  } finally {
    await rm(tmp44, { recursive: true, force: true });
  }

  await writeFile(summaryPath, `${existing.trimEnd()}\n${rows.join('\n')}\n`, 'utf-8');
  console.log(`P4G mutations (1-44) written to ${summaryPath}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith('run-p4g-mutations.ts');
if (isMain) {
  const repoRoot = process.cwd();
  const outDir = path.join(repoRoot, 'out', 'review', 'p4g');
  runP4GMutations(repoRoot, outDir).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
