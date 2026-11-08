export interface QuestionDetectionConfig {
  minWords: number;
  minFollowUpWords: number;
}

export type DetectionCategory =
  'complete-question' | 'follow-up' | 'incomplete' | 'non-question' | 'filler' | 'small-talk';

export interface DetectionInput {
  text: string;
  endpointed: boolean;
}

export interface DetectionResult {
  isQuestion: boolean;
  category: DetectionCategory;
  normalizedText: string;
  score: number;
  reason: string;
  isFollowUp: boolean;
}

const FILLER_PATTERN = /\b(?:um+|uh+|erm?|hmm+|hm+|ah+|eh)\b/gi;

const SMALL_TALK_PATTERN =
  /^(?:hi|hello|hey|good (?:morning|afternoon|evening)|how are you(?: doing)?(?: today)?|how(?:'s| is) it going|nice to meet you|thanks?(?: you)?(?: so much)?|thank you|okay|ok|alright|all right|sounds good|got it|great|perfect|cool|yeah|yep|sure|no problem)$/i;

const QUESTION_START_PATTERN =
  /^(?:what|why|how|when|where|who|whom|whose|which|can you|could you|would you|will you|do you|did you|does|have you|has|are you|is it|is there|tell me|describe|explain|walk me through|talk me through|talk about|give me an example|share an example|suppose|imagine)\b/i;

const INTERVIEW_PROMPT_PATTERN =
  /^(?:tell me|describe|explain|walk me through|talk me through|talk about|give me an example|share an example)\b/i;

const FOLLOW_UP_CONNECTOR_PATTERN = /^(?:and|so|then|but|also|what about|how about)\b/i;

export function stripFillers(text: string): string {
  return text.replace(FILLER_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

/** Lowercase, punctuation-free form used for comparison and duplicate checks. */
export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rule-based, provider-agnostic question detection.
 *
 * It deliberately runs only at speech endpoints (or after a silence timeout),
 * never on every interim transcript, so it is cheap and does not call an LLM.
 */
export class RuleBasedQuestionDetector {
  constructor(private readonly config: QuestionDetectionConfig) {}

  detect(input: DetectionInput): DetectionResult {
    const raw = input.text.trim();
    const cleaned = stripFillers(raw);
    const normalizedText = normalizeQuestionText(cleaned);

    if (!normalizedText) {
      return {
        isQuestion: false,
        category: 'filler',
        normalizedText,
        score: 0,
        reason: 'Only filler words were detected.',
        isFollowUp: false,
      };
    }

    if (SMALL_TALK_PATTERN.test(normalizedText)) {
      return {
        isQuestion: false,
        category: 'small-talk',
        normalizedText,
        score: 0.1,
        reason: 'Small talk or acknowledgement — not an interview question.',
        isFollowUp: false,
      };
    }

    const words = normalizedText.split(' ');
    const wordCount = words.length;
    const endsWithQuestionMark = /\?\s*$/.test(raw);
    const startsWithQuestionWord = QUESTION_START_PATTERN.test(normalizedText);
    const startsWithPrompt = INTERVIEW_PROMPT_PATTERN.test(normalizedText);
    const startsWithConnector = FOLLOW_UP_CONNECTOR_PATTERN.test(normalizedText);
    const afterConnector = normalizedText.replace(FOLLOW_UP_CONNECTOR_PATTERN, '').trim();
    const connectorLeadsToQuestion =
      startsWithConnector && QUESTION_START_PATTERN.test(afterConnector);

    const isFollowUp =
      (startsWithConnector && (connectorLeadsToQuestion || endsWithQuestionMark)) ||
      (!startsWithConnector && !startsWithPrompt && wordCount <= 3 && startsWithQuestionWord);

    const hasQuestionSignal =
      endsWithQuestionMark ||
      startsWithQuestionWord ||
      connectorLeadsToQuestion ||
      startsWithPrompt;

    if (!hasQuestionSignal) {
      if (wordCount < this.config.minWords) {
        return {
          isQuestion: false,
          category: 'incomplete',
          normalizedText,
          score: 0.15,
          reason: 'Utterance is too short to be a complete question.',
          isFollowUp: false,
        };
      }
      return {
        isQuestion: false,
        category: 'non-question',
        normalizedText,
        score: 0.1,
        reason: 'No question structure detected.',
        isFollowUp: false,
      };
    }

    if (!input.endpointed) {
      return {
        isQuestion: false,
        category: 'incomplete',
        normalizedText,
        score: 0.5,
        reason: 'Question-like speech, but no endpoint has been reached yet.',
        isFollowUp,
      };
    }

    const requiredWords = isFollowUp ? this.config.minFollowUpWords : this.config.minWords;

    if (wordCount < requiredWords) {
      return {
        isQuestion: false,
        category: 'incomplete',
        normalizedText,
        score: 0.55,
        reason: 'Question is too short to be complete.',
        isFollowUp,
      };
    }

    let score = 0.55;
    if (endsWithQuestionMark) score += 0.25;
    if (startsWithQuestionWord) score += 0.1;
    if (startsWithPrompt) score += 0.05;
    if (isFollowUp) score += 0.05;
    score = Math.min(1, Math.round(score * 100) / 100);

    return {
      isQuestion: true,
      category: isFollowUp ? 'follow-up' : 'complete-question',
      normalizedText,
      score,
      reason: isFollowUp
        ? 'Follow-up question detected at an endpoint.'
        : 'Complete interview question detected at an endpoint.',
      isFollowUp,
    };
  }
}

/** Jaccard similarity with a containment boost for re-phrased repeats. */
export function questionSimilarity(a: string, b: string): number {
  const aTokens = new Set(normalizeQuestionText(a).split(' ').filter(Boolean));
  const bTokens = new Set(normalizeQuestionText(b).split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  const union = aTokens.size + bTokens.size - intersection;
  const jaccard = intersection / union;
  const containment = intersection / Math.min(aTokens.size, bTokens.size);
  return Math.max(jaccard, containment * 0.95);
}
