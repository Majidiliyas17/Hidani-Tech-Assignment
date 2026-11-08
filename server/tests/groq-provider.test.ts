import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroqChatProvider, mapGroqStatus } from '../src/modules/answer-generation/groq.provider';
import type { ChatProvider } from '../src/modules/answer-generation/types';

const config = {
  apiKey: 'gsk_test_key',
  model: 'llama-3.3-70b-versatile',
  baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
  maxTokens: 350,
  temperature: 0.3,
  timeoutMs: 5_000,
};

async function collect(provider: ChatProvider, signal: AbortSignal): Promise<string[]> {
  const tokens: string[] = [];
  for await (const token of provider.streamChat({
    messages: [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'question' },
    ],
    signal,
  })) {
    tokens.push(token);
  }
  return tokens;
}

describe('GroqChatProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses SSE tokens and stops at [DONE]', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      '',
      ': keepalive',
      '',
      'data: [DONE]',
      '',
      'data: {"choices":[{"delta":{"content":"ignored"}}]}',
      '',
    ].join('\n');

    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(sse, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GroqChatProvider(config);
    const controller = new AbortController();
    const tokens = await collect(provider, controller.signal);

    expect(tokens).toEqual(['Hello', ' world']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      stream: boolean;
      model: string;
      messages: unknown[];
    };
    expect(body.stream).toBe(true);
    expect(body.model).toBe(config.model);
    expect(body.messages).toHaveLength(2);
  });

  it('maps a 429 response to a friendly rate-limit error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Rate limit reached' } }), {
            status: 429,
          }),
      ),
    );

    const provider = new GroqChatProvider(config);
    const controller = new AbortController();

    await expect(collect(provider, controller.signal)).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMIT',
    });
  });

  it('maps quota, auth and model failures without exposing provider payloads', () => {
    expect(mapGroqStatus(402, '').code).toBe('PROVIDER_QUOTA');
    expect(mapGroqStatus(401, '').code).toBe('PROVIDER_AUTH');
    expect(mapGroqStatus(404, 'model_not_found').code).toBe('PROVIDER_MODEL');
    expect(mapGroqStatus(500, '').code).toBe('PROVIDER_UNAVAILABLE');
    expect(mapGroqStatus(429, '').message).toContain('rate limit');
    expect(mapGroqStatus(402, '').message).not.toContain('gsk_');
  });
});
