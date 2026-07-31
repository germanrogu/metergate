import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicAdapter } from './anthropic.adapter';
import { ProviderMalformedResponseError, ProviderRateLimitedError, ProviderTimeoutError } from './provider-adapter';

const REQUEST = {
  model: 'claude-test',
  messages: [
    { role: 'system' as const, content: 'be helpful' },
    { role: 'user' as const, content: 'hi' },
  ],
};

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

describe('AnthropicAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('yields content and token usage on a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          content: [{ type: 'text', text: 'hello back' }],
          usage: { input_tokens: 4, output_tokens: 2 },
        }),
      ),
    );

    const adapter = new AnthropicAdapter('sk-ant-test');
    const chunks = await collect(adapter.send(REQUEST));

    expect(chunks).toEqual([
      { contentDelta: 'hello back', done: false },
      { done: true, inputTokens: 4, outputTokens: 2 },
    ]);
  });

  it('sends the system message as a top-level field, not in messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await collect(new AnthropicAdapter('sk-ant-test').send(REQUEST));

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body.system).toBe('be helpful');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('throws ProviderRateLimitedError on a 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(429, { error: 'rate limited' })));

    await expect(collect(new AnthropicAdapter('sk-ant-test').send(REQUEST))).rejects.toBeInstanceOf(
      ProviderRateLimitedError,
    );
  });

  it('throws ProviderMalformedResponseError when there is no text block', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { content: [] })));

    await expect(collect(new AnthropicAdapter('sk-ant-test').send(REQUEST))).rejects.toBeInstanceOf(
      ProviderMalformedResponseError,
    );
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

    await expect(collect(new AnthropicAdapter('sk-ant-test', 5).send(REQUEST))).rejects.toBeInstanceOf(
      ProviderTimeoutError,
    );
  });
});
