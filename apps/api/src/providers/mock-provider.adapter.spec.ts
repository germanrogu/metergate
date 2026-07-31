import { describe, expect, it } from 'vitest';
import { MockProviderAdapter } from './mock-provider.adapter';
import {
  ProviderMalformedResponseError,
  ProviderRateLimitedError,
  ProviderStreamCutoffError,
  ProviderTimeoutError,
} from './provider-adapter';

const REQUEST = {
  model: 'mock-model',
  messages: [{ role: 'user' as const, content: 'hello there gateway' }],
};

async function collect(iterable: AsyncGenerator<unknown>) {
  const chunks = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('MockProviderAdapter', () => {
  it('yields content then a final chunk with token counts on success', async () => {
    const adapter = new MockProviderAdapter({ scenario: 'success' });
    const chunks = await collect(adapter.send(REQUEST));

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ done: false });
    expect(chunks[1]).toMatchObject({ done: true, inputTokens: 3 });
    expect((chunks[1] as { outputTokens: number }).outputTokens).toBeGreaterThan(0);
  });

  it('throws ProviderTimeoutError after the configured delay', async () => {
    const adapter = new MockProviderAdapter({ scenario: 'timeout', timeoutMs: 1 });

    await expect(collect(adapter.send(REQUEST))).rejects.toBeInstanceOf(ProviderTimeoutError);
  });

  it('throws ProviderRateLimitedError immediately with no content', async () => {
    const adapter = new MockProviderAdapter({ scenario: 'rate_limited' });

    await expect(collect(adapter.send(REQUEST))).rejects.toBeInstanceOf(ProviderRateLimitedError);
  });

  it('yields partial content before throwing ProviderStreamCutoffError', async () => {
    const adapter = new MockProviderAdapter({ scenario: 'cutoff' });
    const iterator = adapter.send(REQUEST);

    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value).toMatchObject({ done: false });

    let caught: unknown;
    try {
      await iterator.next();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProviderStreamCutoffError);
    const cutoffError = caught as ProviderStreamCutoffError;
    expect(cutoffError.deliveredContent.length).toBeGreaterThan(0);
    expect(cutoffError.deliveredOutputTokens).toBeGreaterThan(0);
  });

  it('throws ProviderMalformedResponseError with no content', async () => {
    const adapter = new MockProviderAdapter({ scenario: 'malformed' });

    await expect(collect(adapter.send(REQUEST))).rejects.toBeInstanceOf(ProviderMalformedResponseError);
  });
});
