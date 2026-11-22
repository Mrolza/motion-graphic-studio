import { describe, expect, it } from 'vitest';
import type { FactLedger } from '@core/contracts/fact-ledger';
import type { Script } from '@core/contracts/script';
import type { Timeline } from '@core/contracts/timeline';
import { checkCaptionsQc } from '@core/qc/captions-qc';
import { buildKineticCaptions, captionsToSrt } from '@core/render/kinetic-captions';
import { validatePublishSources } from '@core/stages/publish';
import { validateSceneCodeSafety } from '@core/stages/scene-safety';

const script: Script = {
  scenes: [
    {
      id: 'S1',
      sentences: [
        {
          text: 'Roda kereta memiliki kemiringan 1:20 pada tapaknya.',
          spoken_text: 'Roda kereta memiliki kemiringan 1 banding 20 pada tapaknya.',
          claim_refs: ['C1'],
          emphasis_words: ['kemiringan'],
        },
      ],
    },
  ],
};

const timeline: Timeline = {
  total_sec: 4,
  events: [],
  beats: [],
  shots: [],
  scenes: [{ scene_id: 'S1', start: 0, end: 4, audio_path: 'a.mp3' }],
  words: [
    { scene_id: 'S1', text: 'Roda', start: 0.1, end: 0.4 },
    { scene_id: 'S1', text: 'kereta', start: 0.45, end: 0.8 },
    { scene_id: 'S1', text: 'memiliki', start: 0.85, end: 1.2 },
    { scene_id: 'S1', text: 'kemiringan', start: 1.25, end: 1.7 },
    { scene_id: 'S1', text: '1', start: 1.75, end: 1.9 },
    { scene_id: 'S1', text: 'banding', start: 1.92, end: 2.2 },
    { scene_id: 'S1', text: '20', start: 2.22, end: 2.5 },
    { scene_id: 'S1', text: 'pada', start: 2.55, end: 2.8 },
    { scene_id: 'S1', text: 'tapaknya.', start: 2.85, end: 3.4 },
  ],
};

describe('P4 Part B — Captions, useTrigger safety, and Publish sources', () => {
  it('builds aligned 2-5 word kinetic captions, exports SRT, and detects mutations', () => {
    const chunks = buildKineticCaptions(script, timeline);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.words.length >= 2 && c.words.length <= 5)).toBe(true);
    expect(captionsToSrt(chunks)).toContain('1:20');

    const okRep = checkCaptionsQc({ chunks, script, timeline });
    expect(okRep.issues).toHaveLength(0);

    // Mut 6: altered word -> CAPTION_TEXT_MISMATCH
    const badChunks = structuredClone(chunks);
    badChunks[0]!.words[0]!.text = 'Ban';
    const mismatchRep = checkCaptionsQc({ chunks: badChunks, script, timeline });
    expect(mismatchRep.issues.some((i) => i.message.includes('CAPTION_TEXT_MISMATCH'))).toBe(true);

    // Mut 7: caption overlaps HUD & enters unsafe platform area
    const overlapRep = checkCaptionsQc({
      chunks,
      script,
      timeline,
      telemetrySamples: [
        {
          frame: 10,
          sec: 0.33,
          drivers: {},
          entities: [],
          hud: [
            {
              id: '__kit_captions',
              component: 'KineticCaptions',
              zone: 'caption',
              bbox: { x: 48, y: 1000, width: 600, height: 60 },
              text: 'Roda kereta',
            },
            {
              id: 'S1_H1',
              component: 'Callout',
              zone: 'callout',
              bbox: { x: 48, y: 980, width: 300, height: 60 },
              text: 'Tapak',
            },
          ],
        },
      ],
    });
    expect(overlapRep.issues.some((i) => i.message.includes('CAPTION_HUD_OVERLAP'))).toBe(true);
    expect(overlapRep.issues.some((i) => i.message.includes('CAPTION_UNSAFE_AREA'))).toBe(true);
  });

  it('warns SC_LITERAL_TIMING for literal frame thresholds > 6', () => {
    const safety = validateSceneCodeSafety(`
      import { TelemetryProvider, BlueprintStage, TrainCar, StoryboardHudProvider, Hud } from '@kit/index';
      export const S = ({ frame }: { frame: number }) => (
        <TelemetryProvider><StoryboardHudProvider><BlueprintStage hud={<Hud id="H1" />}>
          {frame > 24 && <TrainCar />}
        </BlueprintStage></StoryboardHudProvider></TelemetryProvider>
      );
    `);
    expect(safety.warnings?.some((w) => w.includes('SC_LITERAL_TIMING'))).toBe(true);
  });

  it('rejects unknown URLs in publish.md (PUBLISH_UNKNOWN_SOURCE)', () => {
    const ledger: FactLedger = {
      claims: [
        {
          id: 'C1',
          kind: 'fact',
          text: 'Tapak kerucut',
          status: 'verified',
          sources: [{ title: 'Wiki', url: 'https://en.wikipedia.org/wiki/Wheelset', quote: 'taper', retrieved_at: '2026-11-20' }],
        },
      ],
    };
    const res = validatePublishSources('Sumber: https://example.com/unverified', ledger);
    expect(res.ok).toBe(false);
    expect(res.unknownUrls).toContain('https://example.com/unverified');
  });
});
