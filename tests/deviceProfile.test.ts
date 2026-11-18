import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { selectProfileFromHardwareAndBenchmark } from '@core/device/profile';
import { createProject, incrementProjectLlmCalls, loadProject } from '@core/project/store';

describe('Device Profile Selection & Project Store', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const d of tempDirs.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('selects hemat when angle fails, penuh on fast NVIDIA RTX, standar on Arc iGPU', () => {
    const baseHw = {
      platform: 'win32',
      arch: 'x64',
      cpuModel: 'Intel Core Ultra 7 256V',
      cpuCores: 8,
      totalRamMb: 16000,
      freeRamMb: 4000,
      gpus: [{ name: 'Intel(R) Arc(TM) Graphics', vendor: 'Intel' }],
      npu: 'Intel(R) AI Boost',
    };

    expect(
      selectProfileFromHardwareAndBenchmark(baseHw, [
        { gl: 'angle', concurrency: 2, renderMs: 0, minFreeRamMb: 1000, ok: false, error: 'no gpu' },
      ]).profile
    ).toBe('hemat');

    expect(
      selectProfileFromHardwareAndBenchmark(baseHw, [
        { gl: 'angle', concurrency: 2, renderMs: 8500, minFreeRamMb: 1500, ok: true },
      ]).profile
    ).toBe('standar');

    expect(
      selectProfileFromHardwareAndBenchmark(
        { ...baseHw, gpus: [{ name: 'NVIDIA GeForce RTX 5070', vendor: 'NVIDIA' }] },
        [{ gl: 'angle', concurrency: 2, renderMs: 4200, minFreeRamMb: 3000, ok: true }]
      ).profile
    ).toBe('penuh');
  });

  it('creates, loads, and increments LLM calls in folder-based project store', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'mgs-proj-'));
    tempDirs.push(tmp);

    const created = await createProject(
      {
        topic: 'Kenapa kereta tidak tergelincir?',
        format: 'how_it_works',
        style: 'blueprint',
      },
      tmp
    );
    expect(created.stages.S1).toBe('pending');
    expect(created.llm_calls.S1).toBe(0);

    await incrementProjectLlmCalls(created.id, 'S1', 2, tmp);
    const loaded = await loadProject(created.id, tmp);
    expect(loaded.llm_calls.S1).toBe(2);
  });
});
