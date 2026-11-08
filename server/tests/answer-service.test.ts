import { describe, expect, it } from 'vitest';
import {
  AnswerService,
  type AnswerCompletedEvent,
  type AnswerEvents,
} from '../src/modules/answer-generation/answer-service';
import type { ChatProvider, ChatStreamParams } from '../src/modules/answer-generation/types';
import type { AnswerMetrics, DetectedQuestion } from '../src/types/protocol';
import { delay } from './helpers';

const context = {
  resume: 'Senior frontend engineer with React and TypeScript experience.',
  jobDescription: 'Senior full-stack engineer for real-time products.',
};

function question(
  id = 'q-1',
  text = 'Tell me about a time you improved performance.',
): DetectedQuestion {
  return {
    id,
    text,
    detectedAt: 0,
    category: 'complete-question',
    isFollowUp: false,
    score: 0.9,
    reason: 'test',
  };
}

function createEventSpy() {
  const tokens: string[] = [];
  const metrics: AnswerMetrics[] = [];
  const completed: AnswerCompletedEvent[] = [];
  const errors: Array<{ answerId: string; code: string }> = [];

  const events: AnswerEvents = {
    onStarted: () => undefined,
    onToken: (_answerId, token) => tokens.push(token),
    onMetrics: (_answerId, value) => metrics.push(value),
    onCompleted: (event) => completed.push(event),
    onError: (answerId, error) => errors.push({ answerId, code: error.code }),
  };

  return { tokens, metrics, completed, errors, events };
}

class SlowChatProvider implements ChatProvider {
  readonly model = 'slow';
  calls = 0;

  async *streamChat({ signal }: ChatStreamParams): AsyncIterable<string> {
    this.calls += 1;
    const call = this.calls;
    yield `call${call}-a`;
    await delay(25);
    if (signal.aborted) {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
    yield `call${call}-b`;
  }
}

describe('AnswerService', () => {
  it('streams tokens and records real latency metrics', async () => {
    let tick = 0;
    const now = () => {
      tick += 100;
      return tick;
    };
    const provider: ChatProvider = {
      model: 'test',
      async *streamChat() {
        yield 'One';
        yield ' two';
      },
    };
    const service = new AnswerService(provider, {
      now,
      idFactory: () => 'answer-1',
    });
    const spy = createEventSpy();

    await service.generate({ question: question(), context, history: [] }, spy.events);

    expect(spy.tokens).toEqual(['One', ' two']);
    expect(spy.completed).toHaveLength(1);
    expect(spy.completed[0]?.text).toBe('One two');
    expect(spy.metrics).toHaveLength(1);

    const metrics = spy.completed[0]?.metrics;
    expect(metrics?.answerStartedAt).toBe(100);
    expect(metrics?.firstTokenAt).toBe(200);
    expect(metrics?.completedAt).toBe(300);
    expect(metrics?.ttftMs).toBe(200);
    expect(metrics?.totalMs).toBe(300);
    expect(metrics?.generationMs).toBe(200);
  });

  it('cancels the previous generation when a new question arrives', async () => {
    const provider = new SlowChatProvider();
    const service = new AnswerService(provider);
    const first = createEventSpy();
    const second = createEventSpy();

    const firstRun = service.generate(
      { question: question('q-1', 'First question?'), context, history: [] },
      first.events,
    );
    await delay(5);

    const secondRun = service.generate(
      { question: question('q-2', 'Second question?'), context, history: [] },
      second.events,
    );

    await Promise.all([firstRun, secondRun]);

    expect(first.completed).toHaveLength(0);
    expect(first.errors).toHaveLength(0);
    expect(first.tokens.join('')).not.toContain('call1-b');
    expect(second.completed).toHaveLength(1);
    expect(second.tokens.join('')).toBe('call2-acall2-b');
  });

  it('reports an error when the provider returns no content', async () => {
    const provider: ChatProvider = {
      model: 'empty',
      // eslint-disable-next-line require-yield
      async *streamChat() {
        return;
      },
    };
    const service = new AnswerService(provider);
    const spy = createEventSpy();

    await service.generate({ question: question(), context, history: [] }, spy.events);

    expect(spy.completed).toHaveLength(0);
    expect(spy.errors).toHaveLength(1);
    expect(spy.errors[0]?.code).toBe('INTERNAL');
  });

  it('includes the current question in the provider prompt', async () => {
    let capturedMessages: ChatStreamParams['messages'] = [];
    const provider: ChatProvider = {
      model: 'test',
      async *streamChat(params) {
        capturedMessages = params.messages;
        yield 'ok';
      },
    };
    const service = new AnswerService(provider);
    const spy = createEventSpy();

    await service.generate(
      {
        question: question('q-9', 'How would you scale a WebSocket service?'),
        context,
        history: [],
      },
      spy.events,
    );

    const userMessage = capturedMessages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('How would you scale a WebSocket service?');
    expect(userMessage?.content).toContain(context.resume);
  });
});
