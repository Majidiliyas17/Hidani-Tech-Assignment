import { describe, expect, it } from 'vitest';
import {
  normalizeQuestionText,
  questionSimilarity,
  RuleBasedQuestionDetector,
} from '../src/modules/question-detection/question-detector';

const detector = new RuleBasedQuestionDetector({ minWords: 4, minFollowUpWords: 1 });

describe('RuleBasedQuestionDetector', () => {
  it('detects a complete question ending with a question mark', () => {
    const result = detector.detect({
      text: 'What is your biggest technical weakness?',
      endpointed: true,
    });

    expect(result.isQuestion).toBe(true);
    expect(result.category).toBe('complete-question');
    expect(result.score).toBeGreaterThan(0.7);
  });

  it('detects interview prompts without a question mark', () => {
    const result = detector.detect({
      text: 'Tell me about a time you handled a production incident',
      endpointed: true,
    });

    expect(result.isQuestion).toBe(true);
    expect(result.category).toBe('complete-question');
  });

  it('detects a short follow-up question', () => {
    const result = detector.detect({ text: 'And why did you choose that?', endpointed: true });

    expect(result.isQuestion).toBe(true);
    expect(result.category).toBe('follow-up');
    expect(result.isFollowUp).toBe(true);
  });

  it('treats a bare question word as a follow-up', () => {
    const result = detector.detect({ text: 'Why?', endpointed: true });

    expect(result.isQuestion).toBe(true);
    expect(result.isFollowUp).toBe(true);
  });

  it('rejects general conversation / statements', () => {
    const result = detector.detect({
      text: 'I worked at a payments company for six years',
      endpointed: true,
    });

    expect(result.isQuestion).toBe(false);
    expect(result.category).toBe('non-question');
  });

  it('rejects filler-only input', () => {
    const result = detector.detect({ text: 'Um, uh, hmm.', endpointed: true });

    expect(result.isQuestion).toBe(false);
    expect(result.category).toBe('filler');
  });

  it('rejects small talk', () => {
    const result = detector.detect({ text: 'How are you doing today?', endpointed: true });

    expect(result.isQuestion).toBe(false);
    expect(result.category).toBe('small-talk');
  });

  it('does not confuse a real question with small talk', () => {
    const result = detector.detect({
      text: 'How are you handling conflicting priorities?',
      endpointed: true,
    });

    expect(result.isQuestion).toBe(true);
  });

  it('does not promote an un-endpointed question-like utterance', () => {
    const result = detector.detect({
      text: 'What is your approach to testing?',
      endpointed: false,
    });

    expect(result.isQuestion).toBe(false);
    expect(result.category).toBe('incomplete');
  });

  it('rejects a too-short prompt', () => {
    const result = detector.detect({ text: 'Tell me about', endpointed: true });

    expect(result.isQuestion).toBe(false);
    expect(result.category).toBe('incomplete');
  });

  it('scores similarity for re-phrased duplicate questions', () => {
    expect(
      questionSimilarity('What are your main strengths?', 'What are your main strengths'),
    ).toBe(1);
    expect(
      questionSimilarity(
        'Could you tell me about your strengths?',
        'Tell me about your strengths?',
      ),
    ).toBeGreaterThanOrEqual(0.82);
    expect(
      questionSimilarity('What are your strengths?', 'Describe a difficult migration.'),
    ).toBeLessThan(0.4);
  });

  it('normalizes punctuation and case for matching', () => {
    expect(normalizeQuestionText('  What’s   your STRENGTH? ')).toBe('what s your strength');
  });
});
