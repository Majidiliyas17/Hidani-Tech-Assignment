import type { AppError } from '../../utils/errors';

export interface TranscriptResult {
  text: string;
  confidence: number;
  durationMs: number;
  speechFinal: boolean;
  receivedAt: number;
}

export interface TranscriptionHandlers {
  onInterim(result: TranscriptResult): void;
  onFinal(result: TranscriptResult): void;
  onUtteranceEnd(): void;
  onError(error: AppError): void;
  onClosed(reason: string): void;
}

export interface DeepgramConfig {
  apiKey: string;
  model: string;
  language: string;
  sampleRate: number;
  endpointingMs: number;
  utteranceEndMs: number;
  connectTimeoutMs: number;
}

export interface TranscriptionProvider {
  readonly name: string;
  readonly ready: boolean;
  connect(): Promise<void>;
  sendAudio(chunk: Buffer): boolean;
  close(): void;
}
