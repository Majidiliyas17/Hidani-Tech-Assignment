import { AppError, isAbortError } from '../../utils/errors';
import type { ChatProvider, ChatStreamParams } from './types';

export interface GroqConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

interface GroqStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export function mapGroqStatus(status: number, body: string): AppError {
  const lower = body.toLowerCase();

  if (status === 401 || status === 403) {
    return new AppError(
      'PROVIDER_AUTH',
      'Groq rejected the API key. Check GROQ_API_KEY in .env and restart the server.',
    );
  }
  if (
    status === 402 ||
    lower.includes('quota') ||
    lower.includes('insufficient') ||
    lower.includes('credit')
  ) {
    return new AppError(
      'PROVIDER_QUOTA',
      'Groq free-tier quota appears to be exhausted. The app will not auto-upgrade to a paid plan.',
    );
  }
  if (status === 429 || lower.includes('rate limit') || lower.includes('rate_limit')) {
    return new AppError(
      'PROVIDER_RATE_LIMIT',
      'Groq free-tier rate limit reached. Wait a few seconds and ask again.',
    );
  }
  if (status === 404 || lower.includes('model_not_found') || lower.includes('does not exist')) {
    return new AppError(
      'PROVIDER_MODEL',
      'The configured Groq model is unavailable for this key. Set GROQ_MODEL to a supported free-tier model.',
    );
  }
  return new AppError(
    'PROVIDER_UNAVAILABLE',
    `Groq answer generation failed (HTTP ${status}). Try again in a moment.`,
  );
}

/**
 * Groq Chat Completions adapter with SSE streaming.
 * Uses fetch directly so every token can be yielded as soon as it arrives.
 */
export class GroqChatProvider implements ChatProvider {
  readonly model: string;

  constructor(private readonly config: GroqConfig) {
    this.model = config.model;
  }

  async *streamChat(params: ChatStreamParams): AsyncIterable<string> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), this.config.timeoutMs);
    const abortUpstream = () => timeoutController.abort();
    params.signal.addEventListener('abort', abortUpstream, { once: true });
    const requestBody = {
      model: this.config.model,
      messages: params.messages,
      stream: true,
      temperature: this.config.temperature,
      max_completion_tokens: this.config.maxTokens,
      ...(this.config.model.startsWith('openai/gpt-oss-')
        ? { reasoning_effort: 'low', include_reasoning: false }
        : {}),
    };

    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: timeoutController.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw mapGroqStatus(response.status, body);
      }
      if (!response.body) {
        throw new AppError('PROVIDER_UNAVAILABLE', 'Groq returned an empty streaming response.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).replace(/\r$/, '').trim();
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf('\n');

          const token = this.parseLine(line);
          if (token === 'DONE') return;
          if (token) yield token;
        }
      }

      const trailing = buffer.replace(/\r$/, '').trim();
      if (trailing) {
        const token = this.parseLine(trailing);
        if (token && token !== 'DONE') yield token;
      }
    } catch (error) {
      if (params.signal.aborted) throw error;
      if (timeoutController.signal.aborted) {
        throw new AppError('PROVIDER_TIMEOUT', 'Groq took too long to respond. Try again.', {
          cause: error,
        });
      }
      if (error instanceof AppError) throw error;
      if (isAbortError(error)) throw error;
      throw new AppError('PROVIDER_UNAVAILABLE', 'Could not reach Groq. Check your network.', {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      params.signal.removeEventListener('abort', abortUpstream);
    }
  }

  /** Returns a token, 'DONE', or null for keepalives/empty deltas. */
  private parseLine(line: string): string | 'DONE' | null {
    if (!line.startsWith('data:')) return null;
    const data = line.slice(5).trim();
    if (!data) return null;
    if (data === '[DONE]') return 'DONE';

    try {
      const parsed = JSON.parse(data) as GroqStreamChunk;
      if (parsed.error) {
        const message = (parsed.error.message ?? '').toLowerCase();
        if (message.includes('rate limit')) {
          throw new AppError('PROVIDER_RATE_LIMIT', 'Groq rate limit reached. Wait a few seconds.');
        }
        if (message.includes('quota') || message.includes('credit')) {
          throw new AppError('PROVIDER_QUOTA', 'Groq free-tier quota appears to be exhausted.');
        }
        throw new AppError('PROVIDER_UNAVAILABLE', 'Groq reported a streaming error. Try again.');
      }
      const content = parsed.choices?.[0]?.delta?.content;
      return content ?? null;
    } catch (error) {
      if (error instanceof AppError) throw error;
      // Ignore malformed keepalive/usage chunks.
      return null;
    }
  }
}
