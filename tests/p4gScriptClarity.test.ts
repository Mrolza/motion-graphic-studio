import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { afterEach, describe, expect, it } from 'vitest';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Project } from '@core/contracts/project';
import type { Script } from '@core/contracts/script';
import { editScriptSentences, parseMarkdownScriptEdits } from '@core/qc/edit-script';
import { validateGate1Approval } from '@core/qc/gate1-check';
import { checkScriptClarity } from '@core/qc/l0b-clarity';
import { scoreQuoteClarity } from '@core/research/quote-scorer';
import { runVoiceStage } from '@core/stages/voice';

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('P4G — Quote Clarity, Script Clarity, Gate 1 Edit, & Sentence TTS Cache', () => {
  it('scores self-contained quotes higher than reference-starting or contradictory quotes (Mutasi 42)', () => {
    const good = scoreQuoteClarity(
      'During the intake stroke, the piston moves downward from TDC to BDC to draw air-fuel mixture.'
    );
    const refStart = scoreQuoteClarity(
      'This stroke draws air and fuel into the cylinder as the piston moves down.'
    );
    const contradictory = scoreQuoteClarity(
      'The piston heads downwards as it travels from B.D.C. to T.D.C. (assuming ideal gas).'
    );
    const tooLong = scoreQuoteClarity(Array.from({ length: 50 }, (_, i) => `word${i}`).join(' '));

    expect(good.score).toBe(100);
    expect(refStart.score).toBeLessThan(good.score);
    expect(contradictory.score).toBeLessThan(refStart.score);
    expect(contradictory.penalties.some((p) => p.includes('contradictory_direction'))).toBe(true);
    expect(tooLong.penalties.some((p) => p.includes('too_long'))).toBe(true);
  });

  it('catches unnamed step, dangling reference, vague phrases, and long sentences (Mutasi 40 & 41)', () => {
    const ledger: FactLedger = {
      claims: [
        {
          id: 'C3',
          text: 'Langkah usaha menghasilkan kerja mekanis.',
          kind: 'fact',
          status: 'verified',
          step_id: 'Usaha',
          sources: [
            {
              url: 'https://en.wikipedia.org/wiki/Four-stroke_engine',
              title: 'Four-stroke engine',
              quote: 'The power stroke produces mechanical work.',
              retrieved_at: new Date().toISOString(),
            },
          ],
        },
      ],
    };

    const badScript: Script = {
      scenes: [
        {
          id: 'S2',
          sentences: [
            {
              text: 'Langkah tersebut menghasilkan kerja mekanis dari satu titik ke titik lain.',
              claim_refs: ['C3'],
              emphasis_words: ['kerja'],
              non_factual: false,
            },
          ],
        },
      ],
    };

    const issues = checkScriptClarity(badScript, {
      keySteps: ['Hisap', 'Kompresi', 'Usaha', 'Buang'],
      ledger,
    });

    expect(issues.some((i) => i.message.includes('L0B_DANGLING_REFERENCE'))).toBe(true);
    expect(issues.some((i) => i.message.includes('L0B_STEP_UNNAMED'))).toBe(true);
    expect(issues.some((i) => i.message.includes('L0B_VAGUE_PHRASE'))).toBe(true);
  });

  it('rejects Gate 1 approval when owner edit drops hedge word, and approves valid edit with 1 L3 call (Mutasi 43)', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'mgs-p4g-edit-'));
    tempDirs.push(repoRoot);
    const id = 'demo-edit';
    const projDir = path.join(repoRoot, 'projects', id);
    await mkdir(path.join(projDir, 'qc'), { recursive: true });

    const project: Project = {
      id,
      topic: 'Bagaimana mesin 4 tak bekerja?',
      format: 'how_it_works',
      style: 'blueprint',
      palette: 'blueprint_dark',
      device_profile: 'hemat',
      target_duration_sec: 35,
      created_at: new Date().toISOString(),
      stages: {
        S1: 'done', S2: 'done', S3: 'done', S4: 'needs_review',
        S5: 'pending', S6: 'pending', S7: 'pending', S8: 'pending',
        S9: 'pending', S10: 'pending', S11: 'pending', S12: 'pending',
      },
      llm_calls: {},
    };
    await writeFile(path.join(projDir, 'project.json'), JSON.stringify(project, null, 2), 'utf-8');

    const ledger: FactLedger = {
      claims: [
        {
          id: 'C1',
          text: 'Sebagian besar mesin bensin memakai empat langkah kerja.',
          kind: 'fact',
          status: 'verified',
          sources: [
            {
              url: 'https://en.wikipedia.org/wiki/Four-stroke_engine',
              title: 'Four-stroke engine',
              quote: 'Most gasoline engines operate on a four-stroke cycle.',
              retrieved_at: new Date().toISOString(),
            },
          ],
        },
      ],
    };
    await writeFile(path.join(projDir, 'fact-ledger.json'), JSON.stringify(ledger, null, 2), 'utf-8');

    const script: Script = {
      scenes: [
        {
          id: 'S1',
          sentences: [
            {
              text: 'Sebagian besar mesin bensin memakai empat langkah kerja.',
              claim_refs: ['C1'],
              emphasis_words: ['empat'],
              non_factual: false,
            },
          ],
        },
      ],
    };
    await writeFile(path.join(projDir, 'script.json'), JSON.stringify(script, null, 2), 'utf-8');
    await writeFile(path.join(projDir, 'qc', 'L1.json'), JSON.stringify({ layer: 'L1', issues: [] }), 'utf-8');
    await writeFile(path.join(projDir, 'qc', 'L2.json'), JSON.stringify({ layer: 'L2', issues: [] }), 'utf-8');

    let llmCalls = 0;
    const mockGen = (async () => {
      llmCalls++;
      return {
        data: { evaluations: [{ ref: 'S1.1', verdict: 'supported', reason: 'OK' }] },
        usage: { model: 'mock', inputTokens: 10, outputTokens: 10 },
      };
    }) as unknown as Parameters<typeof editScriptSentences>[0]['generateJsonFn'];

    // Edit dropping "sebagian besar" -> L2_HEDGE_DROPPED -> approve rejected
    const badEdit = await editScriptSentences({
      projectId: id,
      edits: [{ ref: 'S1.1', text: 'Semua mesin bensin selalu memakai empat langkah kerja.' }],
      repoRoot,
      generateJsonFn: mockGen,
    });
    expect(llmCalls).toBe(1);
    expect(badEdit.l2Report.issues.some((i) => i.message.includes('L2_HEDGE_DROPPED'))).toBe(true);
    const gateBad = await validateGate1Approval(projDir);
    expect(gateBad.approved).toBe(false);

    // Valid edit restoring hedge word -> approve passes
    const parsedFromMd = parseMarkdownScriptEdits(
      '  S1.1: Sebagian besar mesin bensin bekerja dalam empat langkah.',
      JSON.parse(await readFile(path.join(projDir, 'script.json'), 'utf-8')) as Script
    );
    expect(parsedFromMd.length).toBe(1);
    const goodEdit = await editScriptSentences({
      projectId: id,
      edits: parsedFromMd,
      repoRoot,
      generateJsonFn: mockGen,
    });
    expect(goodEdit.hasErrors).toBe(false);
    const gateGood = await validateGate1Approval(projDir);
    expect(gateGood.approved).toBe(true);

    const logLines = (await readFile(path.join(projDir, 'edits.jsonl'), 'utf-8')).trim().split('\n');
    expect(logLines.length).toBe(2);
  });

  it('re-synthesizes TTS only for edited sentence while preserving audio hash of unchanged sentences (Mutasi 44)', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'mgs-p4g-tts-'));
    tempDirs.push(repoRoot);
    const id = 'demo-tts';
    const projDir = path.join(repoRoot, 'projects', id);
    await mkdir(projDir, { recursive: true });

    const project: Project = {
      id,
      topic: 'Mesin 4 tak',
      format: 'how_it_works',
      style: 'blueprint',
      palette: 'blueprint_dark',
      device_profile: 'hemat',
      target_duration_sec: 35,
      created_at: new Date().toISOString(),
      stages: {
        S1: 'done', S2: 'done', S3: 'done', S4: 'done',
        S5: 'pending', S6: 'pending', S7: 'pending', S8: 'pending',
        S9: 'pending', S10: 'pending', S11: 'pending', S12: 'pending',
      },
      llm_calls: {},
    };
    await writeFile(path.join(projDir, 'project.json'), JSON.stringify(project, null, 2), 'utf-8');

    const script: Script = {
      scenes: [
        {
          id: 'S1',
          sentences: [
            { text: 'Kalimat pertama tetap sama.', claim_refs: [], emphasis_words: [], non_factual: true },
            { text: 'Kalimat kedua akan disunting.', claim_refs: [], emphasis_words: [], non_factual: true },
          ],
        },
      ],
    };
    await writeFile(path.join(projDir, 'script.json'), JSON.stringify(script, null, 2), 'utf-8');

    const execFileAsync = promisify(execFile);
    const synthCalls: string[] = [];
    const mockSynth = async (p: { ref: string; text: string; destDisk: string }) => {
      synthCalls.push(p.ref);
      const dur = 0.2 + (p.text.length % 7) * 0.05;
      await execFileAsync(ffmpegInstaller.path, [
        '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
        '-t', dur.toFixed(2), '-q:a', '9', p.destDisk,
      ]);
      return {
        duration_sec: dur,
        words: [{ text: 'kata', start: 0.05, end: 0.15 }],
        engine_used: 'msedge-tts',
      };
    };

    const run1 = await runVoiceStage(id, {
      repoRoot,
      synthesizeSentenceFn: mockSynth,
      skipTighten: true,
    });
    expect(run1.synthesizedSentenceRefs).toEqual(['S1.1', 'S1.2']);
    expect(synthCalls).toEqual(['S1.1', 'S1.2']);

    const manifest1 = JSON.parse(
      await readFile(path.join(projDir, 'audio', 'sentences', 'manifest.json'), 'utf-8')
    ) as Record<string, { audio_sha256: string }>;
    const s11HashBefore = manifest1['S1.1']!.audio_sha256;
    const s12HashBefore = manifest1['S1.2']!.audio_sha256;

    // Edit only S1.2
    script.scenes[0]!.sentences[1]!.text = 'Kalimat kedua sudah diubah.';
    await writeFile(path.join(projDir, 'script.json'), JSON.stringify(script, null, 2), 'utf-8');

    synthCalls.length = 0;
    const run2 = await runVoiceStage(id, {
      repoRoot,
      synthesizeSentenceFn: mockSynth,
      skipTighten: true,
    });
    expect(run2.reusedSentenceRefs).toEqual(['S1.1']);
    expect(run2.synthesizedSentenceRefs).toEqual(['S1.2']);
    expect(synthCalls).toEqual(['S1.2']);

    const manifest2 = JSON.parse(
      await readFile(path.join(projDir, 'audio', 'sentences', 'manifest.json'), 'utf-8')
    ) as Record<string, { audio_sha256: string }>;
    expect(manifest2['S1.1']!.audio_sha256).toBe(s11HashBefore);
    expect(manifest2['S1.2']!.audio_sha256).not.toBe(s12HashBefore);
  });
});
