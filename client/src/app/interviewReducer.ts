import type {
  AnswerMetrics,
  ConnectionState,
  DetectedQuestion,
  ErrorPayload,
  ServerMessage,
  SessionState,
} from '../types/protocol';
import {
  markStreamingAnswersInterrupted,
  type AnswerRecord,
} from '../modules/answers/answer-state';
import {
  appendFinalTranscript,
  type TranscriptSegment,
} from '../modules/transcript/transcript-state';

export interface AppErrorState {
  code: string;
  message: string;
  fatal: boolean;
  answerId?: string;
}

export interface InterviewState {
  connection: ConnectionState;
  session: SessionState;
  sessionId: string | null;
  interim: string;
  finals: TranscriptSegment[];
  currentQuestion: DetectedQuestion | null;
  questions: DetectedQuestion[];
  answers: AnswerRecord[];
  activeAnswerId: string | null;
  metrics: AnswerMetrics | null;
  error: AppErrorState | null;
  notice: string | null;
}

export const initialInterviewState: InterviewState = {
  connection: 'connecting',
  session: 'idle',
  sessionId: null,
  interim: '',
  finals: [],
  currentQuestion: null,
  questions: [],
  answers: [],
  activeAnswerId: null,
  metrics: null,
  error: null,
  notice: null,
};

export type InterviewAction =
  | { type: 'connection'; state: ConnectionState }
  | { type: 'session-starting' }
  | { type: 'session-aborted' }
  | { type: 'server-message'; message: ServerMessage }
  | { type: 'local-error'; code: string; message: string; fatal?: boolean }
  | { type: 'notice'; message: string }
  | { type: 'dismiss-error' }
  | { type: 'dismiss-notice' };

const MAX_QUESTIONS = 20;
const MAX_ANSWERS = 8;

function serverError(state: InterviewState, payload: ErrorPayload): InterviewState {
  const answers = payload.answerId
    ? state.answers.map((answer) =>
        answer.answerId === payload.answerId
          ? { ...answer, status: 'error' as const, error: payload.message }
          : answer,
      )
    : state.answers;

  return {
    ...state,
    answers,
    error: {
      code: payload.code,
      message: payload.message,
      fatal: payload.fatal,
      ...(payload.answerId ? { answerId: payload.answerId } : {}),
    },
  };
}

export function interviewReducer(state: InterviewState, action: InterviewAction): InterviewState {
  switch (action.type) {
    case 'connection':
      return { ...state, connection: action.state };

    case 'session-starting':
      return {
        ...state,
        session: 'connecting',
        sessionId: null,
        interim: '',
        finals: [],
        currentQuestion: null,
        questions: [],
        answers: [],
        activeAnswerId: null,
        metrics: null,
        error: null,
        notice: null,
      };

    case 'session-aborted':
      return {
        ...state,
        session: state.session === 'connecting' ? 'idle' : state.session,
        sessionId: null,
        interim: '',
      };

    case 'local-error':
      return {
        ...state,
        error: {
          code: action.code,
          message: action.message,
          fatal: action.fatal ?? false,
        },
      };

    case 'notice':
      return { ...state, notice: action.message };

    case 'dismiss-error':
      return { ...state, error: null };

    case 'dismiss-notice':
      return { ...state, notice: null };

    case 'server-message':
      return applyServerMessage(state, action.message);

    default:
      return state;
  }
}

function applyServerMessage(state: InterviewState, message: ServerMessage): InterviewState {
  switch (message.type) {
    case 'session:status': {
      const { state: sessionState, sessionId, detail } = message.payload;
      const ended = sessionState === 'stopped' || sessionState === 'error';
      return {
        ...state,
        session: sessionState,
        sessionId: sessionId ?? state.sessionId,
        answers: ended
          ? markStreamingAnswersInterrupted(
              state.answers,
              detail ?? 'Session ended before this answer finished.',
            )
          : state.answers,
        activeAnswerId: ended ? null : state.activeAnswerId,
      };
    }

    case 'transcription:interim':
      return { ...state, interim: message.payload.text };

    case 'transcription:final':
      return {
        ...state,
        interim: '',
        finals: appendFinalTranscript(state.finals, message.payload),
      };

    case 'question:detected':
      return {
        ...state,
        currentQuestion: message.payload,
        questions: [
          message.payload,
          ...state.questions.filter((item) => item.id !== message.payload.id),
        ].slice(0, MAX_QUESTIONS),
        interim: '',
      };

    case 'answer:started': {
      const { answerId, questionId, startedAt } = message.payload;
      if (state.answers.some((answer) => answer.answerId === answerId)) return state;

      const questionText =
        state.currentQuestion?.id === questionId
          ? state.currentQuestion.text
          : (state.questions.find((question) => question.id === questionId)?.text ??
            'Detected interview question');

      const nextAnswer: AnswerRecord = {
        answerId,
        questionId,
        questionText,
        status: 'streaming',
        text: '',
        startedAt,
        completedAt: null,
        metrics: null,
      };

      return {
        ...state,
        answers: [...state.answers, nextAnswer].slice(-MAX_ANSWERS),
        activeAnswerId: answerId,
        metrics: null,
        error: state.error?.answerId ? null : state.error,
      };
    }

    case 'answer:token':
      return {
        ...state,
        answers: state.answers.map((answer) =>
          answer.answerId === message.payload.answerId
            ? { ...answer, text: answer.text + message.payload.token }
            : answer,
        ),
      };

    case 'answer:completed':
      return {
        ...state,
        answers: state.answers.map((answer) =>
          answer.answerId === message.payload.answerId
            ? {
                ...answer,
                text: message.payload.text,
                status: 'completed',
                completedAt: message.payload.completedAt,
                metrics: message.payload.metrics,
              }
            : answer,
        ),
        activeAnswerId: message.payload.answerId,
        metrics: message.payload.metrics,
      };

    case 'metrics:updated':
      return {
        ...state,
        answers: state.answers.map((answer) =>
          answer.answerId === message.payload.answerId
            ? { ...answer, metrics: message.payload.metrics }
            : answer,
        ),
        metrics:
          state.activeAnswerId === message.payload.answerId
            ? message.payload.metrics
            : state.metrics,
      };

    case 'context:updated':
      return state;

    case 'error':
      return serverError(state, message.payload);

    default:
      return state;
  }
}
