import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DailyQuotaExhaustedError, generateJson, type LlmCallRecord } from '@core/llm';

const SampleSchema = z.object({
  title: z.string().min(1),
  count: z.number().int().positive(),
});

function makeJsonResponse(text: string, status = 200) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 15 },
    }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('LLM Client generateJson (mocked fetch)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses valid JSON, validates with Zod, and records call', async () => {
    const records: LlmCallRecord[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeJsonResponse('{"title":"Kereta","count":3}'))
    );

    const res = await generateJson(SampleSchema, 'Test prompt', {
      apiKey: 'test-key',
      model: 'gemini-3.5-flash-lite',
      stage: 'S1',
      onCallRecord: (r) => {
        records.push(r);
      },
    });

    expect(res.data).toEqual({ title: 'Kereta', count: 3 });
    expect(res.attempts).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0].ok).toBe(true);
    expect(records[0].stage).toBe('S1');
  });

  it('retries with error feedback on invalid JSON or Zod failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeJsonResponse('not-json'))
      .mockResolvedValueOnce(makeJsonResponse('{"title":"Kereta","count":-5}'))
      .mockResolvedValueOnce(makeJsonResponse('{"title":"Kereta","count":2}'));

    vi.stubGlobal('fetch', fetchMock);

    const res = await generateJson(SampleSchema, 'Test prompt', {
      apiKey: 'test-key',
      retryDelayMs: 0,
    });

    expect(res.data).toEqual({ title: 'Kereta', count: 2 });
    expect(res.attempts).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries on transient 503 error and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
      .mockResolvedValueOnce(makeJsonResponse('{"title":"Mesin","count":4}'));

    vi.stubGlobal('fetch', fetchMock);

    const res = await generateJson(SampleSchema, 'Test prompt', {
      apiKey: 'test-key',
      retryDelayMs: 0,
    });

    expect(res.data).toEqual({ title: 'Mesin', count: 4 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails fast on daily quota exhausted (429 PerDay) without retrying', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Quota exceeded for GenerateRequestsPerDay' } }), {
          status: 429,
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateJson(SampleSchema, 'Test prompt', { apiKey: 'test-key', retryDelayMs: 0 })
    ).rejects.toThrow(DailyQuotaExhaustedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on timeout/network error and throws after maxTransientRetries', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('The operation was aborted due to timeout'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateJson(SampleSchema, 'Test prompt', {
        apiKey: 'test-key',
        maxTransientRetries: 1,
        retryDelayMs: 0,
      })
    ).rejects.toThrow(/timeout/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
