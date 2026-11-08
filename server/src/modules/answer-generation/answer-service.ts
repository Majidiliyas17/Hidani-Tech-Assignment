import { randomUUID } from 'node:crypto';
import type { AnswerMetrics, DetectedQuestion, InterviewContext } from '../../types/protocol';
import { toAppError } from '../../utils/errors';
import type { QAPair } from '../../types/domain';
import { buildAnswerMessages, DEFAULT_PROMPT_LIMITS, type PromptLimits } from './prompt-builder';
import type { ChatProvider } from './types';

export interface AnswerRequest {
  question: DetectedQuestion;
  context: InterviewContext;
  history: QAPair[];
}

export interface AnswerStartedEvent {
  answerId: string;
  questionId: string;
  startedAt: number;
}

export interface AnswerCompletedEvent {
  answerId: string;
  questionId: string;
  text: string;
  completedAt: number;
  metrics: AnswerMetrics;
}

export interface AnswerEvents {
  onStarted(event: AnswerStartedEvent): void;
  onToken(answerId: string, token: string): void;
  onMetrics(answerId: string, metrics: AnswerMetrics): void;
  onCompleted(event: AnswerCompletedEvent): void;
  onError(answerId: string, error: ReturnType<typeof toAppError>): void;
}

export interface AnswerServiceOptions {
  promptLimits?: PromptLimits;
  now?: () => number;
  idFactory?: () => string;
}

/**
 * Streams one answer at a time. A new detected question cancels the previous
 * stream so tokens from stale generations can never reach the client.
 */
export class AnswerService {
  private controller: AbortController | null = null;
  private generation = 0;
  private activeAnswerId: string | null = null;
  private readonly promptLimits: PromptLimits;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly provider: ChatProvider,
    options: AnswerServiceOptions = {},
  ) {
    this.promptLimits = options.promptLimits ?? DEFAULT_PROMPT_LIMITS;
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? randomUUID;
  }

  get isGenerating(): boolean {
    return this.activeAnswerId !== null;
  }

  cancel(): void {
    this.generation += 1;
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
    this.activeAnswerId = null;
  }

  async generate(request: AnswerRequest, events: AnswerEvents): Promise<void> {
    this.cancel();

    const generation = this.generation;
    const controller = new AbortController();
    const answerId = this.idFactory();
    this.controller = controller;
    this.activeAnswerId = answerId;

    const questionCompletedAt = request.question.detectedAt;
    const answerStartedAt = this.now();

    events.onStarted({
      answerId,
      questionId: request.question.id,
      startedAt: answerStartedAt,
    });

    let firstTokenAt: number | null = null;
    let text = '';

    const buildMetrics = (completedAt: number | null): AnswerMetrics => ({
      questionCompletedAt,
      answerStartedAt,
      firstTokenAt,
      completedAt,
      ttftMs: firstTokenAt === null ? null : firstTokenAt - questionCompletedAt,
      generationMs: completedAt === null ? null : completedAt - answerStartedAt,
      totalMs: completedAt === null ? null : completedAt - questionCompletedAt,
    });

    try {
      const messages = buildAnswerMessages(
        {
          context: request.context,
          question: request.question.text,
          history: request.history,
        },
        this.promptLimits,
      );

      for await (const token of this.provider.streamChat({
        messages,
        signal: controller.signal,
      })) {
        if (generation !== this.generation) return;

        if (firstTokenAt === null) {
          firstTokenAt = this.now();
          events.onMetrics(answerId, buildMetrics(null));
        }

        text += token;
        events.onToken(answerId, token);
      }

      if (generation !== this.generation) return;
      if (!text.trim()) {
        throw new Error('The answer provider returned an empty answer.');
      }

      const completedAt = this.now();
      events.onCompleted({
        answerId,
        questionId: request.question.id,
        text,
        completedAt,
        metrics: buildMetrics(completedAt),
      });
    } catch (error) {
      if (generation !== this.generation) return;
      if (isAbortLike(error)) return;
      events.onError(answerId, toAppError(error));
    } finally {
      if (generation === this.generation) {
        this.controller = null;
        this.activeAnswerId = null;
      }
    }
  }
}

function isAbortLike(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message));
}
