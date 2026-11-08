/**
 * Mirror of `server/src/types/protocol.ts`.
 * This is the typed contract for every WebSocket message.
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
  questionCompletedAt: number;
  answerStartedAt: number;
  firstTokenAt: number | null;
  completedAt: number | null;
  ttftMs: number | null;
  generationMs: number | null;
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

export interface HealthResponse {
  status: 'ok';
  timestamp: number;
  uptimeSec: number;
  providers: {
    deepgram: { configured: boolean; model: string; sampleRate: number };
    groq: { configured: boolean; model: string };
  };
  questionDetection: { silenceMs: number; minWords: number };
  websocket: { path: string };
}
