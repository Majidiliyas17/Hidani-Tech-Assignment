import type { ChatProvider, ChatStreamParams } from '../src/modules/answer-generation/types';
import type {
  TranscriptionHandlers,
  TranscriptionProvider,
  TranscriptResult,
} from '../src/modules/transcription/types';
import type { ClientSessionDeps, SessionSocket } from '../src/websocket/client-session';
import type { ServerMessage } from '../src/types/protocol';
import type { Logger } from '../src/utils/logger';
import { AppError } from '../src/utils/errors';

export const noop = (): void => {};

export const silentLogger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  child: () => silentLogger,
};

export const validContext = {
  resume:
    'Senior full-stack engineer with 6 years building React, TypeScript and Node.js products. Led a payments migration used by 40k customers.',
  jobDescription:
    'We are hiring a senior full-stack engineer with strong React, TypeScript and Node.js experience to build real-time customer products.',
};

export interface Clock {
  value: number;
}

export class FakeSocket implements SessionSocket {
  readyState = 1;
  messages: ServerMessage[] = [];

  send(data: string | Buffer): void {
    if (typeof data !== 'string') return;
    this.messages.push(JSON.parse(data) as ServerMessage);
  }

  close(): void {
    this.readyState = 3;
  }
}

export function messagesOfType<T extends ServerMessage['type']>(
  socket: FakeSocket,
  type: T,
): Array<Extract<ServerMessage, { type: T }>> {
  return socket.messages.filter(
    (message): message is Extract<ServerMessage, { type: T }> => message.type === type,
  );
}

export class FakeTranscription implements TranscriptionProvider {
  readonly name = 'fake';
  ready = false;
  connected = false;
  closed = false;
  connectCalls = 0;
  connectDelayMs = 0;
  audio: Buffer[] = [];
  handlers: TranscriptionHandlers | null = null;
  failWith: Error | null = null;

  async connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.connectDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.connectDelayMs));
    }
    if (this.failWith) throw this.failWith;
    this.ready = true;
    this.connected = true;
  }

  sendAudio(chunk: Buffer): boolean {
    if (!this.ready) return false;
    this.audio.push(chunk);
    return true;
  }

  close(): void {
    this.ready = false;
    this.closed = true;
  }

  attach(handlers: TranscriptionHandlers): void {
    this.handlers = handlers;
  }

  emitInterim(text: string): void {
    this.handlers?.onInterim(this.result(text, false));
  }

  emitFinal(text: string, speechFinal = true): void {
    this.handlers?.onFinal(this.result(text, speechFinal));
  }

  emitClosed(reason = 'test close'): void {
    this.handlers?.onClosed(reason);
  }

  private result(text: string, speechFinal: boolean): TranscriptResult {
    return {
      text,
      confidence: 0.98,
      durationMs: 1200,
      speechFinal,
      receivedAt: 1_700_000_000_000,
    };
  }
}

export class FakeChatProvider implements ChatProvider {
  readonly model = 'fake-chat';
  calls: ChatStreamParams[] = [];
  private readonly tokens: string[];
  private readonly error: Error | null;

  constructor(tokens: string[] = ['Answer', ' text'], error: Error | null = null) {
    this.tokens = tokens;
    this.error = error;
  }

  async *streamChat(params: ChatStreamParams): AsyncIterable<string> {
    this.calls.push(params);
    if (this.error) throw this.error;
    for (const token of this.tokens) {
      yield token;
    }
  }
}

export function makeSessionDeps(
  transcription: FakeTranscription,
  chat: ChatProvider,
  clock: Clock,
): ClientSessionDeps {
  let idCounter = 0;
  return {
    question: {
      silenceMs: 60,
      minWords: 4,
      minFollowUpWords: 1,
      duplicateWindowMs: 30_000,
      duplicateSimilarity: 0.82,
    },
    logger: silentLogger,
    createTranscription: (handlers) => {
      transcription.attach(handlers);
      return transcription;
    },
    createChatProvider: () => chat,
    now: () => clock.value,
    idFactory: () => `test-id-${++idCounter}`,
  };
}

export function failingTranscription(message = 'Provider unavailable'): FakeTranscription {
  const transcription = new FakeTranscription();
  transcription.failWith = new AppError('PROVIDER_UNAVAILABLE', message, { fatal: true });
  return transcription;
}

export async function waitFor(predicate: () => boolean, timeoutMs = 1_500): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
