import type { AnswerMetrics } from '../../types/protocol';

export type AnswerStatus = 'streaming' | 'completed' | 'error';

export interface AnswerRecord {
  answerId: string;
  questionId: string;
  questionText: string;
  status: AnswerStatus;
  text: string;
  startedAt: number;
  completedAt: number | null;
  metrics: AnswerMetrics | null;
  error?: string;
}

/** Called when the session stops/errors while Groq is still streaming. */
export function markStreamingAnswersInterrupted(
  answers: AnswerRecord[],
  message: string,
): AnswerRecord[] {
  return answers.map((answer) =>
    answer.status === 'streaming' ? { ...answer, status: 'error', error: message } : answer,
  );
}
