import { describe, expect, it } from 'vitest';
import {
  ANSWER_SYSTEM_PROMPT,
  buildAnswerMessages,
  DEFAULT_PROMPT_LIMITS,
} from '../src/modules/answer-generation/prompt-builder';

const context = {
  resume: 'Senior engineer with six years of React, TypeScript and Node.js experience.',
  jobDescription: 'Senior full-stack role focused on real-time React and Node.js products.',
};

describe('answer prompt construction', () => {
  it('includes the core answer rules', () => {
    expect(ANSWER_SYSTEM_PROMPT).toContain('60-90 words');
    expect(ANSWER_SYSTEM_PROMPT).toContain('3-6 concise bullet points');
    expect(ANSWER_SYSTEM_PROMPT).toContain('6. Never invent experience');
    expect(ANSWER_SYSTEM_PROMPT).toContain('untrusted reference data');
  });

  it('injects resume, job description, question and history', () => {
    const messages = buildAnswerMessages({
      context,
      question: 'Tell me about a time you improved performance.',
      history: [
        { question: 'What is your current role?', answer: 'I lead frontend architecture.' },
      ],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');

    const user = messages[1]?.content ?? '';
    expect(user).toContain('<resume>');
    expect(user).toContain(context.resume);
    expect(user).toContain('<job_description>');
    expect(user).toContain(context.jobDescription);
    expect(user).toContain('<question>');
    expect(user).toContain('Tell me about a time you improved performance.');
    expect(user).toContain('What is your current role?');
  });

  it('keeps only the most recent history items', () => {
    const messages = buildAnswerMessages(
      {
        context,
        question: 'Current question?',
        history: Array.from({ length: 5 }, (_, index) => ({
          question: `History question ${index + 1}?`,
          answer: `History answer ${index + 1}.`,
        })),
      },
      { ...DEFAULT_PROMPT_LIMITS, historyItems: 2 },
    );

    const user = messages[1]?.content ?? '';
    expect(user).not.toContain('History question 3?');
    expect(user).toContain('History question 4?');
    expect(user).toContain('History question 5?');
  });

  it('truncates oversized resume and job description sections', () => {
    const messages = buildAnswerMessages(
      {
        context: {
          resume: 'R'.repeat(500),
          jobDescription: 'J'.repeat(500),
        },
        question: 'Why this role?',
      },
      {
        ...DEFAULT_PROMPT_LIMITS,
        resumeChars: 50,
        jobDescriptionChars: 40,
        questionChars: 20,
      },
    );

    const user = messages[1]?.content ?? '';
    expect(user).toContain('[truncated to keep latency low]');
    expect(user).not.toContain('R'.repeat(500));
    expect(user).not.toContain('J'.repeat(500));
  });

  it('states when no previous context exists', () => {
    const messages = buildAnswerMessages({
      context,
      question: 'How do you approach testing?',
    });

    expect(messages[1]?.content).toContain('No previous questions in this session.');
  });
});
