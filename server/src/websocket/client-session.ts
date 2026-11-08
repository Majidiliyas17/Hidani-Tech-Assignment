import { randomUUID } from 'node:crypto';
import { AnswerService } from '../modules/answer-generation/answer-service';
import type { ChatProvider } from '../modules/answer-generation/types';
import { validateAudioChunk } from '../modules/audio/audio-validator';
import { ContextService, validateContextInput } from '../modules/context/context.service';
import type { QAPair } from '../types/domain';
import {
  QuestionDetectionService,
  type QuestionDetectionServiceConfig,
} from '../modules/question-detection/detection-service';
import { normalizeQuestionText } from '../modules/question-detection/question-detector';
import type { TranscriptionHandlers, TranscriptionProvider } from '../modules/transcription/types';
import type { PromptLimits } from '../modules/answer-generation/prompt-builder';
import type {
  DetectedQuestion,
  InterviewContext,
  ServerMessage,
  SessionStartMessage,
  SessionState,
} from '../types/protocol';
import { AppError, toAppError, toErrorPayload } from '../utils/errors';
import type { Logger } from '../utils/logger';
import { parseClientMessage } from './message-schemas';

export interface SessionSocket {
  readyState: number;
  send(data: string | Buffer, callback?: (error?: Error) => void): void;
}

export interface ClientSessionDeps {
  question: QuestionDetectionServiceConfig;
  logger: Logger;
  createTranscription(handlers: TranscriptionHandlers): TranscriptionProvider;
  createChatProvider(): ChatProvider;
  promptLimits?: PromptLimits;
  now?: () => number;
  idFactory?: () => string;
}

const SOCKET_OPEN = 1;
const MAX_BUFFERED_AUDIO_BYTES = 96_000; // ~3 s at 16 kHz mono linear16
const AUDIO_ERROR_THROTTLE_MS = 2_000;
const HISTORY_LIMIT = 4;

/**
 * One interview session per WebSocket connection.
 *
 * Orchestrates: audio validation → Deepgram → endpointed transcript →
 * question detection → Groq streaming answer → metrics, with deterministic
 * cleanup on stop/error/disconnect. Providers are injected for testability.
 */
export class ClientSession {
  private state: SessionState = 'idle';
  private sessionId: string | null = null;
  private startSequence = 0;
  private disposed = false;

  private transcription: TranscriptionProvider | null = null;
  private detection: QuestionDetectionService | null = null;
  private answerService: AnswerService | null = null;

  private readonly contextService = new ContextService();
  private history: QAPair[] = [];

  private transcriptSeq = 0;
  private lastFinalNormalized = '';
  private audioBuffer: Buffer[] = [];
  private audioBufferBytes = 0;
  private lastAudioErrorAt = 0;

  private readonly logger: Logger;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly socket: SessionSocket,
    private readonly deps: ClientSessionDeps,
  ) {
    this.logger = deps.logger;
    this.now = deps.now ?? Date.now;
    this.idFactory = deps.idFactory ?? randomUUID;
  }

  handleMessage(raw: string): void {
    if (this.disposed) return;

    let message;
    try {
      message = parseClientMessage(raw);
    } catch (error) {
      this.sendError(error);
      return;
    }

    if (message.type === 'session:start') {
      void this.start(message.payload);
      return;
    }
    if (message.type === 'session:stop') {
      this.stop(message.payload?.reason ?? 'user');
      return;
    }
    if (message.type === 'context:update') {
      this.updateContext(message.payload.context);
    }
  }

  handleAudio(chunk: Buffer): void {
    if (this.disposed) return;

    if (this.state !== 'active' && this.state !== 'connecting') {
      this.sendAudioError('Start a listening session before sending audio.');
      return;
    }

    try {
      validateAudioChunk(chunk);
    } catch (error) {
      this.sendAudioError(toAppError(error).message);
      return;
    }

    if (this.state === 'connecting') {
      if (this.audioBufferBytes + chunk.length <= MAX_BUFFERED_AUDIO_BYTES) {
        this.audioBuffer.push(chunk);
        this.audioBufferBytes += chunk.length;
      }
      return;
    }

    if (!this.transcription?.sendAudio(chunk)) {
      this.logger.debug('Audio chunk dropped (provider not ready or backpressure)', {
        bytes: chunk.length,
      });
    }
  }

  stop(reason = 'user'): void {
    if (this.disposed) return;
    const sessionId = this.sessionId;
    this.cleanupResources();
    this.state = 'stopped';
    this.history = [];
    this.sessionId = null;

    this.send({
      type: 'session:status',
      payload: {
        state: 'stopped',
        ...(sessionId ? { sessionId } : {}),
        detail: reason,
      },
    });
    this.logger.info('Session stopped', { reason });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cleanupResources();
    this.contextService.clear();
    this.history = [];
    this.sessionId = null;
    this.state = 'stopped';
  }

  private async start(payload: SessionStartMessage['payload']): Promise<void> {
    if (this.state === 'active' || this.state === 'connecting') {
      this.sendError(
        new AppError(
          'SESSION_ALREADY_ACTIVE',
          'A listening session is already active. Stop it before starting another.',
        ),
      );
      return;
    }

    const validation = validateContextInput(payload.context);
    if (!validation.valid || !validation.value) {
      this.sendError(
        new AppError(
          'CONTEXT_INVALID',
          Object.values(validation.errors).filter(Boolean).join(' ') ||
            'Resume and job description are required before starting.',
        ),
      );
      return;
    }

    try {
      this.contextService.set(validation.value);
    } catch (error) {
      this.sendError(error);
      return;
    }

    this.cleanupResources();
    this.sessionId = this.idFactory();
    const sessionId = this.sessionId;
    const sequence = this.startSequence;

    this.state = 'connecting';
    this.history = [];
    this.transcriptSeq = 0;
    this.lastFinalNormalized = '';
    this.audioBuffer = [];
    this.audioBufferBytes = 0;

    this.send({ type: 'session:status', payload: { state: 'connecting', sessionId } });
    this.logger.info('Session connecting', { sessionId, source: payload.source });

    const isCurrent = () =>
      !this.disposed && this.sessionId === sessionId && this.startSequence === sequence;

    const handlers: TranscriptionHandlers = {
      onInterim: (result) => {
        if (!isCurrent()) return;
        this.send({
          type: 'transcription:interim',
          payload: {
            id: `${sessionId}-interim`,
            text: result.text,
            receivedAt: result.receivedAt,
            confidence: result.confidence,
          },
        });
      },
      onFinal: (result) => {
        if (!isCurrent()) return;
        this.handleFinalTranscript(result);
      },
      onUtteranceEnd: () => {
        if (!isCurrent()) return;
        this.detection?.flush();
      },
      onError: (error) => {
        if (!isCurrent()) return;
        this.failSession(error);
      },
      onClosed: (reason) => {
        if (!isCurrent()) return;
        this.failSession(
          new AppError(
            'PROVIDER_UNAVAILABLE',
            `Deepgram connection closed unexpectedly (${reason}).`,
            { fatal: true },
          ),
        );
      },
    };

    try {
      this.detection = new QuestionDetectionService(
        this.deps.question,
        (question) => this.handleDetectedQuestion(question),
        this.now,
        this.idFactory,
      );

      this.transcription = this.deps.createTranscription(handlers);
      this.answerService = new AnswerService(this.deps.createChatProvider(), {
        now: this.now,
        idFactory: this.idFactory,
        ...(this.deps.promptLimits ? { promptLimits: this.deps.promptLimits } : {}),
      });

      await this.transcription.connect();
    } catch (error) {
      if (this.sessionId !== sessionId || this.startSequence !== sequence) {
        this.transcription?.close();
        return;
      }
      this.failSession(error);
      return;
    }

    if (
      this.disposed ||
      this.sessionId !== sessionId ||
      this.startSequence !== sequence ||
      this.state !== 'connecting'
    ) {
      this.transcription?.close();
      return;
    }

    this.state = 'active';
    this.flushBufferedAudio();
    this.send({ type: 'session:status', payload: { state: 'active', sessionId } });
    this.logger.info('Session active', { sessionId });
  }

  private handleFinalTranscript(result: {
    text: string;
    confidence: number;
    durationMs: number;
    speechFinal: boolean;
    receivedAt: number;
  }): void {
    const normalized = normalizeQuestionText(result.text);
    if (normalized && normalized === this.lastFinalNormalized) return;
    this.lastFinalNormalized = normalized;

    const id = `${this.sessionId}-final-${++this.transcriptSeq}`;
    this.send({
      type: 'transcription:final',
      payload: {
        id,
        text: result.text,
        receivedAt: result.receivedAt,
        confidence: result.confidence,
        durationMs: result.durationMs,
      },
    });

    this.detection?.recordFinal(result.text, result.speechFinal);
  }

  private handleDetectedQuestion(question: DetectedQuestion): void {
    if (this.state !== 'active' || !this.answerService) return;
    const context = this.contextService.get();
    if (!context) return;

    this.send({ type: 'question:detected', payload: question });
    this.logger.info('Question detected', {
      chars: question.text.length,
      category: question.category,
      score: question.score,
    });

    const answerService = this.answerService;
    void answerService.generate(
      {
        question,
        context,
        history: [...this.history],
      },
      {
        onStarted: (event) => {
          if (!this.isCurrentAnswer(answerService)) return;
          this.send({ type: 'answer:started', payload: event });
        },
        onToken: (answerId, token) => {
          if (!this.isCurrentAnswer(answerService)) return;
          this.send({ type: 'answer:token', payload: { answerId, token } });
        },
        onMetrics: (answerId, metrics) => {
          if (!this.isCurrentAnswer(answerService)) return;
          this.send({ type: 'metrics:updated', payload: { answerId, metrics } });
        },
        onCompleted: (event) => {
          if (!this.isCurrentAnswer(answerService)) return;
          this.send({ type: 'answer:completed', payload: event });
          this.history = [...this.history, { question: question.text, answer: event.text }].slice(
            -HISTORY_LIMIT,
          );
          this.logger.info('Answer completed', {
            chars: event.text.length,
            ttftMs: event.metrics.ttftMs,
            totalMs: event.metrics.totalMs,
          });
        },
        onError: (answerId, error) => {
          if (!this.isCurrentAnswer(answerService)) return;
          this.sendError(error, answerId);
          this.logger.warn('Answer generation failed', { code: error.code });
        },
      },
    );
  }

  private isCurrentAnswer(answerService: AnswerService): boolean {
    return this.state === 'active' && this.answerService === answerService;
  }

  private updateContext(context: InterviewContext): void {
    try {
      this.contextService.set(context);
      this.send({ type: 'context:updated', payload: { updatedAt: this.now() } });
      this.logger.info('Session context updated');
    } catch (error) {
      this.sendError(error);
    }
  }

  private flushBufferedAudio(): void {
    const chunks = this.audioBuffer;
    this.audioBuffer = [];
    this.audioBufferBytes = 0;
    for (const chunk of chunks) {
      this.transcription?.sendAudio(chunk);
    }
  }

  private failSession(error: unknown): void {
    if (this.state === 'error' || this.state === 'stopped' || this.disposed) return;

    const appError = toAppError(error);
    const sessionId = this.sessionId;

    this.sendError(appError);
    this.cleanupResources();
    this.state = 'error';
    this.sessionId = null;
    this.send({
      type: 'session:status',
      payload: {
        state: 'error',
        ...(sessionId ? { sessionId } : {}),
        detail: appError.message,
      },
    });
    this.logger.error('Session failed', { code: appError.code });
  }

  private cleanupResources(): void {
    this.startSequence += 1;

    this.detection?.stop();
    this.detection = null;

    this.answerService?.cancel();
    this.answerService = null;

    this.transcription?.close();
    this.transcription = null;

    this.audioBuffer = [];
    this.audioBufferBytes = 0;
  }

  private sendAudioError(message: string): void {
    const now = this.now();
    if (now - this.lastAudioErrorAt < AUDIO_ERROR_THROTTLE_MS) return;
    this.lastAudioErrorAt = now;
    this.sendError(new AppError('AUDIO_INVALID', message));
  }

  private sendError(error: unknown, answerId?: string): void {
    const payload = toErrorPayload(error, answerId);
    this.logger.warn('WebSocket error sent', { code: payload.code });
    this.send({ type: 'error', payload });
  }

  private send(message: ServerMessage): void {
    if (this.socket.readyState !== SOCKET_OPEN) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      this.logger.warn('Failed to send WebSocket message', {
        type: message.type,
        cause: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
