import type { ClientRequest, IncomingMessage } from 'node:http';
import WebSocket, { type RawData } from 'ws';
import { AppError } from '../../utils/errors';
import type {
  DeepgramConfig,
  TranscriptionHandlers,
  TranscriptionProvider,
  TranscriptResult,
} from './types';

interface DeepgramAlternative {
  transcript?: string;
  confidence?: number;
}

interface DeepgramMessage {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  duration?: number;
  channel?: {
    alternatives?: DeepgramAlternative[];
  };
}

function mapDeepgramStatus(statusCode: number, statusMessage: string): AppError {
  const detail = `${statusCode} ${statusMessage}`.trim();
  if (statusCode === 401 || statusCode === 403) {
    return new AppError(
      'PROVIDER_AUTH',
      'Deepgram rejected the API key. Check DEEPGRAM_API_KEY in .env and restart the server.',
      { fatal: true },
    );
  }
  if (statusCode === 402) {
    return new AppError(
      'PROVIDER_QUOTA',
      'Deepgram free-tier credits appear to be exhausted. The app will not auto-upgrade to a paid plan.',
      { fatal: true },
    );
  }
  if (statusCode === 429) {
    return new AppError(
      'PROVIDER_RATE_LIMIT',
      'Deepgram rate limit reached. Wait a moment before starting another session.',
      { fatal: true },
    );
  }
  return new AppError(
    'PROVIDER_UNAVAILABLE',
    `Deepgram is unavailable (${detail}). Check your network and try again.`,
    { fatal: true },
  );
}

function mapDeepgramClose(code: number, reason: string): AppError {
  const lower = reason.toLowerCase();
  if (lower.includes('credit') || lower.includes('quota') || lower.includes('payment')) {
    return new AppError(
      'PROVIDER_QUOTA',
      'Deepgram free-tier credits appear to be exhausted. The app will not auto-upgrade to a paid plan.',
      { fatal: true },
    );
  }
  if (
    code === 1008 ||
    lower.includes('auth') ||
    lower.includes('api key') ||
    lower.includes('credential')
  ) {
    return new AppError(
      'PROVIDER_AUTH',
      'Deepgram closed the connection due to an authentication problem. Check DEEPGRAM_API_KEY.',
      { fatal: true },
    );
  }
  if (lower.includes('rate')) {
    return new AppError('PROVIDER_RATE_LIMIT', 'Deepgram rate limit reached.', { fatal: true });
  }
  return new AppError(
    'PROVIDER_UNAVAILABLE',
    `Deepgram connection closed unexpectedly${reason ? `: ${reason}` : ` (code ${code})`}.`,
    { fatal: true },
  );
}

/**
 * Deepgram real-time STT adapter. Audio arrives as raw little-endian 16-bit PCM
 * at 16 kHz mono, which Deepgram accepts as `encoding=linear16`.
 */
export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'deepgram';

  private socket: WebSocket | null = null;
  private isReady = false;
  private closedByUs = false;
  private failed = false;
  private keepAliveTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: DeepgramConfig,
    private readonly handlers: TranscriptionHandlers,
  ) {}

  get ready(): boolean {
    return this.isReady;
  }

  connect(): Promise<void> {
    this.closedByUs = false;
    this.failed = false;

    const params = new URLSearchParams({
      model: this.config.model,
      language: this.config.language,
      encoding: 'linear16',
      sample_rate: String(this.config.sampleRate),
      channels: '1',
      interim_results: 'true',
      punctuate: 'true',
      smart_format: 'true',
      endpointing: String(this.config.endpointingMs),
      utterance_end_ms: String(this.config.utteranceEndMs),
      vad_events: 'true',
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    const socket = new WebSocket(url, {
      headers: { Authorization: `Token ${this.config.apiKey}` },
      handshakeTimeout: this.config.connectTimeoutMs,
    });
    this.socket = socket;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
      };

      const fail = (error: AppError) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.failed = true;
        this.isReady = false;
        this.stopKeepAlive();
        try {
          socket.terminate();
        } catch {
          // Socket may already be closed.
        }
        reject(error);
      };

      timeout = setTimeout(() => {
        fail(
          new AppError(
            'PROVIDER_TIMEOUT',
            'Timed out while connecting to Deepgram. Check your network and try again.',
            { fatal: true },
          ),
        );
      }, this.config.connectTimeoutMs);

      socket.on('open', () => {
        if (settled) {
          socket.close();
          return;
        }
        settled = true;
        cleanup();
        this.isReady = true;
        this.startKeepAlive();
        resolve();
      });

      socket.on('message', (data: RawData) => this.handleMessage(data));

      socket.on('unexpected-response', (_request: ClientRequest, response: IncomingMessage) => {
        response.resume();
        fail(mapDeepgramStatus(response.statusCode ?? 0, response.statusMessage ?? ''));
      });

      socket.on('error', (error) => {
        if (!settled) {
          fail(
            new AppError('PROVIDER_UNAVAILABLE', 'Could not connect to Deepgram.', {
              fatal: true,
              cause: error,
            }),
          );
          return;
        }
        if (this.closedByUs || this.failed) return;
        this.failed = true;
        this.isReady = false;
        this.stopKeepAlive();
        this.handlers.onError(
          new AppError('PROVIDER_UNAVAILABLE', 'Deepgram connection error.', {
            fatal: true,
            cause: error,
          }),
        );
      });

      socket.on('close', (code, reasonBuffer) => {
        this.isReady = false;
        this.stopKeepAlive();
        const reason = reasonBuffer.toString();

        if (!settled) {
          fail(mapDeepgramClose(code, reason));
          return;
        }
        if (this.closedByUs || this.failed) return;

        this.failed = true;
        this.handlers.onError(mapDeepgramClose(code, reason));
      });
    });
  }

  sendAudio(chunk: Buffer): boolean {
    const socket = this.socket;
    if (!this.isReady || !socket || socket.readyState !== WebSocket.OPEN) return false;
    // Backpressure guard: audio is real-time, dropping is better than unbounded memory.
    if (socket.bufferedAmount > 1_000_000) return false;
    socket.send(chunk, { binary: true });
    return true;
  }

  close(): void {
    this.closedByUs = true;
    this.isReady = false;
    this.stopKeepAlive();

    const socket = this.socket;
    this.socket = null;
    if (!socket) return;

    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: 'CloseStream' }));
      } catch {
        // Best effort.
      }
      socket.close(1000, 'session ended');
    } else if (socket.readyState === WebSocket.CONNECTING) {
      socket.terminate();
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      const socket = this.socket;
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: 'KeepAlive' }));
        } catch {
          // The close handler will take care of the failure.
        }
      }
    }, 8_000);
    this.keepAliveTimer.unref?.();
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private handleMessage(data: RawData): void {
    let message: DeepgramMessage;
    try {
      message = JSON.parse(data.toString()) as DeepgramMessage;
    } catch {
      return;
    }

    if (message.type === 'UtteranceEnd') {
      this.handlers.onUtteranceEnd();
      return;
    }

    if (message.type !== 'Results') return;

    const alternative = message.channel?.alternatives?.[0];
    const text = alternative?.transcript?.trim() ?? '';
    if (!text) return;

    const result: TranscriptResult = {
      text,
      confidence: alternative?.confidence ?? 0,
      durationMs: Math.round((message.duration ?? 0) * 1000),
      speechFinal: Boolean(message.speech_final),
      receivedAt: Date.now(),
    };

    if (message.is_final || message.speech_final) {
      this.handlers.onFinal(result);
    } else {
      this.handlers.onInterim(result);
    }
  }
}
