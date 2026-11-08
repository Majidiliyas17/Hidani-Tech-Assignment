import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionDetectionService } from '../src/modules/question-detection/detection-service';
import type { DetectedQuestion } from '../src/types/protocol';

const baseConfig = {
  silenceMs: 900,
  minWords: 4,
  minFollowUpWords: 1,
  duplicateWindowMs: 30_000,
  duplicateSimilarity: 0.82,
};

function createService(now: () => number, config = baseConfig) {
  const detected: DetectedQuestion[] = [];
  let id = 0;
  const service = new QuestionDetectionService(
    config,
    (question) => detected.push(question),
    now,
    () => `q-${++id}`,
  );
  return { service, detected };
}

describe('QuestionDetectionService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects a question when the provider reports speech_final', () => {
    const { service, detected } = createService(() => 1_000);
    const result = service.recordFinal('What are your strongest skills?', true);

    expect(result).not.toBeNull();
    expect(result?.text).toBe('What are your strongest skills?');
    expect(detected).toHaveLength(1);
    service.stop();
  });

  it('accumulates final segments until the endpoint', () => {
    const { service, detected } = createService(() => 1_000);

    expect(service.recordFinal('What is your', false)).toBeNull();
    expect(service.recordFinal('biggest weakness?', true)).not.toBeNull();

    expect(detected).toHaveLength(1);
    expect(detected[0]?.text).toBe('What is your biggest weakness?');
    service.stop();
  });

  it('uses the silence fallback when no provider endpoint arrives', () => {
    vi.useFakeTimers();
    const { service, detected } = createService(() => 1_000);

    service.recordFinal('Describe a difficult bug you fixed.', false);
    expect(detected).toHaveLength(0);

    vi.advanceTimersByTime(950);
    expect(detected).toHaveLength(1);
    service.stop();
  });

  it('prevents duplicate questions inside the window', () => {
    const clock = { value: 1_000_000 };
    const { service, detected } = createService(() => clock.value);
    const config = { ...baseConfig };

    service.recordFinal('What are your main strengths?', true);
    service.recordFinal('What are your main strengths', true);
    service.recordFinal('What are your main strengths please?', true);

    expect(detected).toHaveLength(1);

    clock.value += config.duplicateWindowMs + 1;
    service.recordFinal('What are your main strengths?', true);
    expect(detected).toHaveLength(2);
    service.stop();
  });

  it('allows a genuinely different question in the same window', () => {
    const { service, detected } = createService(() => 1_000);

    service.recordFinal('What are your strengths?', true);
    service.recordFinal('Tell me about a conflict with a teammate.', true);

    expect(detected).toHaveLength(2);
    expect(detected[1]?.text).toContain('conflict');
    service.stop();
  });

  it('clears pending segments and timers on stop', () => {
    vi.useFakeTimers();
    const { service, detected } = createService(() => 1_000);

    service.recordFinal('How do you handle deadlines?', false);
    service.stop();
    vi.advanceTimersByTime(5_000);

    expect(detected).toHaveLength(0);
  });

  it('does not call the detector output for non-questions', () => {
    const { service, detected } = createService(() => 1_000);

    service.recordFinal('I have been working with React for years.', true);
    service.recordFinal('Okay, sounds good.', true);

    expect(detected).toHaveLength(0);
    service.stop();
  });
});
