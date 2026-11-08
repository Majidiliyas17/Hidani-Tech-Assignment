/**
 * Wire protocol shared between the Node server and the React client.
 * The client has a mirror of this file at `client/src/types/protocol.ts`.
 * Keep both copies in sync — the protocol is the contract of the app.
 */

export type AudioSource = 'microphone' | 'tab';

export type SessionState = 'idle' | 'connecting' | 'active' | 'stopped' | 'error';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface InterviewContext {
  resume: string;
  jobDescription: string;
}

export interface DetectedQuestion {
  id: string;
  text: string;
  detectedAt: number;
  category: 'complete-question' | 'follow-up';
  isFollowUp: boolean;
  score: number;
  reason: string;
}

export interface AnswerMetrics {
  /** Epoch ms — the moment endpointing decided a question was complete. */
  questionCompletedAt: number;
  /** Epoch ms — the moment the Groq request started. */
  answerStartedAt: number;
  /** Epoch ms — first streamed token, or null while waiting. */
  firstTokenAt: number | null;
  /** Epoch ms — stream finished, or null while streaming. */
  completedAt: number | null;
  /** firstTokenAt - questionCompletedAt (null until the first token). */
  ttftMs: number | null;
  /** completedAt - answerStartedAt (null until completion). */
  generationMs: number | null;
  /** completedAt - questionCompletedAt (null until completion). */
  totalMs: number | null;
}

export interface TranscriptPayload {
  id: string;
  text: string;
  receivedAt: number;
  confidence?: number;
  durationMs?: number;
}

export interface SessionStatusPayload {
  state: SessionState;
  sessionId?: string;
  detail?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  fatal: boolean;
  answerId?: string;
}

/* -------------------------------------------------------------------------- */
/* Client → Server                                                            */
/* -------------------------------------------------------------------------- */

export interface SessionStartMessage {
  type: 'session:start';
  payload: {
    context: InterviewContext;
    source: AudioSource;
  };
}

export interface SessionStopMessage {
  type: 'session:stop';
  payload?: {
    reason?: string;
  };
}

export interface ContextUpdateMessage {
  type: 'context:update';
  payload: {
    context: InterviewContext;
  };
}

export type ClientMessage = SessionStartMessage | SessionStopMessage | ContextUpdateMessage;

/** Binary WebSocket frames are raw 16 kHz mono signed 16-bit little-endian PCM. */
export type AudioChunk = ArrayBuffer;

/* -------------------------------------------------------------------------- */
/* Server → Client                                                            */
/* -------------------------------------------------------------------------- */

export type ServerMessage =
  | { type: 'session:status'; payload: SessionStatusPayload }
  | { type: 'transcription:interim'; payload: TranscriptPayload }
  | { type: 'transcription:final'; payload: TranscriptPayload }
  | { type: 'question:detected'; payload: DetectedQuestion }
  | { type: 'answer:started'; payload: { answerId: string; questionId: string; startedAt: number } }
  | { type: 'answer:token'; payload: { answerId: string; token: string } }
  | {
      type: 'answer:completed';
      payload: {
        answerId: string;
        questionId: string;
        text: string;
        completedAt: number;
        metrics: AnswerMetrics;
      };
    }
  | { type: 'metrics:updated'; payload: { answerId: string; metrics: AnswerMetrics } }
  | { type: 'context:updated'; payload: { updatedAt: number } }
  | { type: 'error'; payload: ErrorPayload };

export type ServerMessageType = ServerMessage['type'];

export const WS_PATH = '/ws';
