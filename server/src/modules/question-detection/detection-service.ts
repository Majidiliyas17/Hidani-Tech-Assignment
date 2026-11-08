import { randomUUID } from 'node:crypto';
import type { DetectedQuestion } from '../../types/protocol';
import {
  normalizeQuestionText,
  questionSimilarity,
  RuleBasedQuestionDetector,
} from './question-detector';

export interface QuestionDetectionServiceConfig {
  silenceMs: number;
  minWords: number;
  minFollowUpWords: number;
  duplicateWindowMs: number;
  duplicateSimilarity: number;
}

interface RecentQuestion {
  text: string;
  at: number;
}

/**
 * Turns final transcript segments into completed questions.
 *
 * Two endpoint signals are supported:
 *  - Deepgram `speech_final` / `UtteranceEnd` (passed as `endpoint: true`)
 *  - A configurable server-side silence timer after the last final segment
 *
 * The detector itself knows nothing about audio or Deepgram.
 */
export class QuestionDetectionService {
  private pendingSegments: string[] = [];
  private silenceTimer: NodeJS.Timeout | null = null;
  private recentQuestions: RecentQuestion[] = [];
  private readonly detector: RuleBasedQuestionDetector;

  constructor(
    private readonly config: QuestionDetectionServiceConfig,
    private readonly onDetected: (question: DetectedQuestion) => void,
    private readonly now: () => number = Date.now,
    private readonly idFactory: () => string = randomUUID,
    detector?: RuleBasedQuestionDetector,
  ) {
    this.detector =
      detector ??
      new RuleBasedQuestionDetector({
        minWords: config.minWords,
        minFollowUpWords: config.minFollowUpWords,
      });
  }

  /**
   * Feed one final transcript segment.
   * @param endpoint true when the STT provider reports the utterance ended.
   * @returns the detected question, if this segment completed one.
   */
  recordFinal(text: string, endpoint: boolean): DetectedQuestion | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    this.pendingSegments.push(trimmed);

    if (endpoint) {
      return this.evaluate();
    }

    this.scheduleSilenceEvaluation();
    return null;
  }

  /** Called on Deepgram `UtteranceEnd`; harmless if speech_final already fired. */
  flush(): DetectedQuestion | null {
    return this.evaluate();
  }

  stop(): void {
    this.clearSilenceTimer();
    this.pendingSegments = [];
    this.recentQuestions = [];
  }

  private scheduleSilenceEvaluation(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      this.evaluate();
    }, this.config.silenceMs);
    this.silenceTimer.unref?.();
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private evaluate(): DetectedQuestion | null {
    this.clearSilenceTimer();

    const text = this.pendingSegments.join(' ').replace(/\s+/g, ' ').trim();
    this.pendingSegments = [];
    if (!text) return null;

    const result = this.detector.detect({ text, endpointed: true });
    if (!result.isQuestion) return null;
    if (this.isDuplicate(result.normalizedText)) return null;

    const detectedAt = this.now();
    const question: DetectedQuestion = {
      id: this.idFactory(),
      text,
      detectedAt,
      category: result.category === 'follow-up' ? 'follow-up' : 'complete-question',
      isFollowUp: result.isFollowUp,
      score: result.score,
      reason: result.reason,
    };

    this.rememberQuestion(result.normalizedText, detectedAt);
    this.onDetected(question);
    return question;
  }

  private isDuplicate(normalizedText: string): boolean {
    const cutoff = this.now() - this.config.duplicateWindowMs;
    this.recentQuestions = this.recentQuestions.filter((item) => item.at >= cutoff);

    return this.recentQuestions.some(
      (item) =>
        normalizeQuestionText(item.text) === normalizedText ||
        questionSimilarity(item.text, normalizedText) >= this.config.duplicateSimilarity,
    );
  }

  private rememberQuestion(normalizedText: string, at: number): void {
    this.recentQuestions.push({ text: normalizedText, at });
    // Bound memory for long-running sessions.
    if (this.recentQuestions.length > 20) {
      this.recentQuestions.shift();
    }
  }
}
