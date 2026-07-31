import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiAdapter } from './openai.adapter';
import { ProviderMalformedResponseError, ProviderRateLimitedError, ProviderTimeoutError } from './provider-adapter';

const REQUEST = { model: 'gpt-test', messages: [{ role: 'user' as const, content: 'hi' }] };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

async function collect(iterable: AsyncGenerator<unknown>) {
  const chunks = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('OpenAiAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('yields content and token usage on a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          choices: [{ message: { content: 'hello back' } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }),
      ),
    );

    const adapter = new OpenAiAdapter('sk-test');
    const chunks = await collect(adapter.send(REQUEST));

    expect(chunks).toEqual([
      { contentDelta: 'hello back', done: false },
      { done: true, inputTokens: 3, outputTokens: 2 },
    ]);
  });

  it('throws ProviderRateLimitedError on a 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(429, { error: 'rate limited' })));

    const adapter = new OpenAiAdapter('sk-test');

    await expect(collect(adapter.send(REQUEST))).rejects.toBeInstanceOf(ProviderRateLimitedError);
  });

  it('throws ProviderMalformedResponseError when required fields are missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { choices: [] })));

    const adapter = new OpenAiAdapter('sk-test');

    await expect(collect(adapter.send(REQUEST))).rejects.toBeInstanceOf(ProviderMalformedResponseError);
  });

  it('throws ProviderMalformedResponseError on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' })));

    const adapter = new OpenAiAdapter('sk-test');

    await expect(collect(adapter.send(REQUEST))).rejects.toBeInstanceOf(ProviderMalformedResponseError);
  });

  it('throws ProviderTimeoutError when the request is aborted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      }),
    );

    const adapter = new OpenAiAdapter('sk-test', 5);

    await expect(collect(adapter.send(REQUEST))).rejects.toBeInstanceOf(ProviderTimeoutError);
  });
});
