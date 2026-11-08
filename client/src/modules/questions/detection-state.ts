import type { SessionState } from '../../types/protocol';

export type QuestionDetectionTone = 'zinc' | 'amber' | 'emerald' | 'indigo';

export interface QuestionDetectionView {
  label: string;
  tone: QuestionDetectionTone;
  pulse: boolean;
}

/** Presentation state for the detection engine; no network calls involved. */
export function getQuestionDetectionView(input: {
  session: SessionState;
  hasInterim: boolean;
  isThinking: boolean;
}): QuestionDetectionView {
  const listening = input.session === 'active' || input.session === 'connecting';

  if (!listening) {
    return { label: 'Not listening', tone: 'zinc', pulse: false };
  }
  if (input.isThinking) {
    return { label: 'Generating answer', tone: 'indigo', pulse: true };
  }
  if (input.hasInterim) {
    return {
      label: 'Speech detected · waiting for endpoint',
      tone: 'amber',
      pulse: true,
    };
  }
  return { label: 'Listening for a complete question', tone: 'emerald', pulse: true };
}
