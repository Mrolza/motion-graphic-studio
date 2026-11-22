import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import type { Storyboard } from '@core/contracts/storyboard';
import type { Timeline } from '@core/contracts/timeline';
import {
  checkQuotaBeforeRun,
  LlmBudgetExceededError,
  QuotaPreflightError,
  RunLlmTracker,
} from '@core/llm/budget';
import { verifyStoryboardCode } from '@core/qc/storyboard-code';
import { KitFaultError, runScenesStage } from '@core/stages/scene-coder';
import { createProject, loadProject, saveProject } from '@core/project/store';
import { computeEffectiveCompareRadii } from '../remotion/src/kit/drivers/kinematics';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const d of tempDirs.splice(0)) {
    await rm(d, { recursive: true, force: true }).catch(() => {});
  }
});

const sampleLedger: FactLedger = {
  claims: [
    {
      id: 'C1',
      kind: 'fact',
      text: 'Kemiringan tapak 1 banding 20.',
      value: 20,
      status: 'verified',
      sources: [{ title: 'W', url: 'https://example.com', quote: 'taper of about 1 in 20', retrieved_at: '2026-11-20' }],
    },
  ],
};

const sampleScript: Script = {
  scenes: [
    { id: 'S1', sentences: [{ text: 'Kereta melaju.', claim_refs: ['C1'], emphasis_words: [] }] },
    { id: 'S2', sentences: [{ text: 'Penampang roda.', claim_refs: ['C1'], emphasis_words: [] }] },
    { id: 'S3', sentences: [{ text: 'Ringkasan.', claim_refs: ['C1'], emphasis_words: [] }] },
  ],
};

const sampleTimeline: Timeline = {
  total_sec: 12,
  events: [],
  beats: [],
  shots: [],
  scenes: [
    { scene_id: 'S1', start: 0, end: 4, audio_path: 'a.mp3' },
    { scene_id: 'S2', start: 4, end: 8, audio_path: 'b.mp3' },
    { scene_id: 'S3', start: 8, end: 12, audio_path: 'c.mp3' },
  ],
  words: [
    { scene_id: 'S1', text: 'Kereta', start: 0.1, end: 0.5 },
    { scene_id: 'S2', text: 'Penampang', start: 4.1, end: 4.5 },
    { scene_id: 'S3', text: 'Ringkasan', start: 8.1, end: 8.5 },
  ],
};

const sampleStoryboard: Storyboard = {
  scenes: [
    {
      id: 'S1',
      lane: 'code_3d',
      shot_type: 'establishing',
      duration_sec: 4,
      sentence_refs: ['S1.1'],
      focus_entities: ['train_car'],
      visible_parts: ['body'],
      hud: [{ hud_id: 'S1_H1', component: 'KineticTitle', props: { title: 'Intro' }, illustrative: true }],
      trigger_words: ['Kereta'],
    },
    {
      id: 'S2',
      lane: 'code_3d',
      shot_type: 'cross_section',
      view: 'section',
      duration_sec: 4,
      sentence_refs: ['S2.1'],
      focus_entities: ['rail_cross_section'],
      visible_parts: ['wheel_left', 'wheel_right', 'flange'],
      hud: [{ hud_id: 'S2_H1', component: 'Callout', props: { label: 'Tapak kerucut' }, claim_ref: 'C1' }],
      trigger_words: ['Penampang'],
    },
    {
      id: 'S3',
      lane: 'code_3d',
      shot_type: 'summary',
      duration_sec: 4,
      sentence_refs: ['S3.1'],
      focus_entities: ['train_car'],
      visible_parts: ['body'],
      hud: [{ hud_id: 'S3_H1', component: 'KineticTitle', props: { title: 'Akhir' }, illustrative: true }],
      trigger_words: ['Ringkasan'],
    },
  ],
};

const VALID_SCENE_TSX = `import React from 'react';
import { BlueprintStage, CameraRig, Ground, Hud, HudLayout, HudZone, StoryboardHudProvider, TelemetryProvider, TrainCar, useDriver } from '../../../kit';
export const Scene_S1: React.FC<{ telemetry?: boolean; hudData?: any[] }> = ({ telemetry = false, hudData = [] }) => {
  const driver = useDriver({ name: 'distance', from: 0, to: 1, unit: 'm', startSec: 0, durationSec: 2 });
  return (
    <TelemetryProvider enabled={telemetry}>
      <StoryboardHudProvider items={hudData}>
        <BlueprintStage telemetry={telemetry} hud={<HudLayout><HudZone zone="title"><Hud id="S1_H1" driver={driver} /></HudZone></HudLayout>}>
          <CameraRig mode="frameEntities" focusBox={{ center: [0, 1, 0], size: [2, 2, 4] }} />
          <Ground size={20} divisions={20} y={0} />
          <TrainCar entityId="train_car" distance={driver.value} />
        </BlueprintStage>
      </StoryboardHudProvider>
    </TelemetryProvider>
  );
};`;

describe('P4B Part A & B — Budget, Cache, Kit Fault, Compare, & HUD Length', () => {
  it('enforces MGS_LLM_BUDGET_PER_RUN, logs llm-calls.jsonl without counting http_retries, and checks quota preflight', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'mgs-p4b-'));
    tempDirs.push(tmp);
    const tracker = new RunLlmTracker({ projectDir: tmp, runId: 'r1', limit: 3 });

    await tracker.recordCall({ stage: 'S6', purpose: 'sb', attempt: 1, http_retries: 2, ok: true });
    await tracker.recordCall({ stage: 'S7', purpose: 'l5', attempt: 1, http_retries: 0, ok: true });
    await tracker.recordCall({ stage: 'S8', purpose: 'scene', scene_id: 'S1', attempt: 1, http_retries: 0, ok: true });
    expect(() => tracker.assertCanCall('S8', 'scene')).toThrow(LlmBudgetExceededError);

    const lines = (await readFile(path.join(tmp, 'llm-calls.jsonl'), 'utf-8')).trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!).http_retries).toBe(2);

    await checkQuotaBeforeRun({ estimatedCalls: 5, rpdLimit: 100, repoRoot: tmp });
    await writeFile(
      path.join(tmp, '.mgs', 'quota.json').replace(`${path.sep}.mgs`, `${path.sep}.mgs`),
      JSON.stringify({ date: new Date().toISOString().slice(0, 10), gemini: { used: 96 } })
    ).catch(async () => {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(path.join(tmp, '.mgs'), { recursive: true });
      await writeFile(
        path.join(tmp, '.mgs', 'quota.json'),
        JSON.stringify({ date: new Date().toISOString().slice(0, 10), gemini: { used: 96 } })
      );
    });
    await expect(checkQuotaBeforeRun({ estimatedCalls: 5, rpdLimit: 100, repoRoot: tmp })).rejects.toThrow(
      QuotaPreflightError
    );
  });

  it('reuses cached passing scenes and stops with KIT_FAULT (0 S9 calls) on kit-owned errors', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'mgs-p4b-scenes-'));
    tempDirs.push(tmp);
    await createProject({ id: 'p-test', topic: 'Test', format: 'how_its_made', style: 'blueprint' }, tmp);
    const p = await loadProject('p-test', tmp);
    p.stages.S7 = 'done';
    await saveProject(p, tmp);

    const pDir = path.join(tmp, 'projects', 'p-test');
    await writeFile(path.join(pDir, 'script.json'), JSON.stringify(sampleScript));
    await writeFile(path.join(pDir, 'timeline.json'), JSON.stringify(sampleTimeline));
    await writeFile(path.join(pDir, 'fact-ledger.json'), JSON.stringify(sampleLedger));
    await writeFile(path.join(pDir, 'storyboard.json'), JSON.stringify(sampleStoryboard));

    let mockCalls = 0;
    const mockLlm = async (_schema: unknown, _prompt: string, opts: { sceneId?: string | null; tracker?: RunLlmTracker }) => {
      mockCalls++;
      await opts.tracker?.recordCall({ stage: 'S8', purpose: 'mock', scene_id: opts.sceneId, ok: true });
      const tsx = VALID_SCENE_TSX.replace(/Scene_S1/g, `Scene_${opts.sceneId ?? 'S1'}`);
      return { data: { tsx }, model: 'mock', attempts: 1, httpRetries: 0, totalDurationMs: 1 };
    };

    const tracker = new RunLlmTracker({ projectDir: pDir, runId: 'r-cache', limit: 20 });
    let failS2 = true;
    const mockQc = async (params: { spec: { compositionId: string } }) => {
      const isS2 = params.spec.compositionId.endsWith('-S2');
      const ok = !(isS2 && failS2);
      const rep = (issues: Array<{ severity: 'error'; message: string; ref: string; owner?: 'kit' | 'scene' }>) => ({
        layer: 'framing' as const,
        issues,
      });
      return {
        compositionId: params.spec.compositionId,
        passed: ok,
        sampleCount: 1,
        renderMs: 1,
        reports: {
          mechanics: rep([]),
          geometry: rep([]),
          visibility: rep([]),
          framing: ok ? rep([]) : rep([{ severity: 'error', message: 'FRAMING_OUT_OF_BOUNDS', ref: 'f0', owner: 'kit' }]),
          hudOverlap: rep([]),
          hudFormat: rep([]),
          onscreenTruth: rep([]),
          sync: rep([]),
          blank: rep([]),
        },
      };
    };

    // First run: S1 passes (1 call), S2 hits KIT_FAULT (1 call S8, 0 calls S9!)
    await expect(
      runScenesStage('p-test', tmp, {
        tracker,
        generateJsonFn: mockLlm as never,
        runVisualQcFn: mockQc as never,
        skipTscAndRegistry: true,
      })
    ).rejects.toThrow(KitFaultError);
    expect(mockCalls).toBe(2); // S1 + S2 S8 only; 0 S9 calls!

    // Fix kit, re-run: S1 is reused (0 calls!), only S2 and S3 are generated (2 calls!)
    failS2 = false;
    mockCalls = 0;
    const res = await runScenesStage('p-test', tmp, {
      tracker,
      generateJsonFn: mockLlm as never,
      runVisualQcFn: mockQc as never,
      skipTscAndRegistry: true,
    });
    expect(mockCalls).toBe(2);
    expect(res[0]!.cached).toBe(true);
    expect(res.every((r) => r.passed)).toBe(true);
  });

  it('validates EffectiveDiameterCompare radii & sign and rejects >12 word Callouts (HUD_TOO_LONG)', () => {
    const cRight = computeEffectiveCompareRadii(0.06, 0.06);
    expect(cRight.outerSide).toBe('right');
    expect(cRight.outerRadiusPx).toBeGreaterThanOrEqual(cRight.innerRadiusPx * 1.15);
    expect(cRight.outerRadiusPx).toBeLessThanOrEqual(cRight.innerRadiusPx * 1.25);

    const cLeft = computeEffectiveCompareRadii(-0.06, 0.06);
    expect(cLeft.outerSide).toBe('left');
    expect(cLeft.outerRadiusPx).toBeGreaterThanOrEqual(cLeft.innerRadiusPx * 1.1);

    const cMid = computeEffectiveCompareRadii(0, 0.06);
    expect(cMid.leftRadiusPx).toBe(cMid.rightRadiusPx);

    const longSb = structuredClone(sampleStoryboard);
    longSb.scenes[1]!.hud[0]!.props = {
      label: 'Ini adalah kalimat callout yang sangat panjang sekali melebihi dua belas kata penuh di layar',
    };
    const rep = verifyStoryboardCode(longSb, sampleScript, sampleTimeline, sampleLedger);
    expect(rep.issues.some((i) => i.message.includes('HUD_TOO_LONG'))).toBe(true);
  });
});
