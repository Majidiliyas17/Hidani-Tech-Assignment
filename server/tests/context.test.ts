import { describe, expect, it } from 'vitest';
import { CONTEXT_LIMITS, validateContextInput } from '../src/modules/context/context.service';

describe('context validation', () => {
  it('rejects empty fields', () => {
    const result = validateContextInput({ resume: '', jobDescription: '' });

    expect(result.valid).toBe(false);
    expect(result.errors.resume).toBeDefined();
    expect(result.errors.jobDescription).toBeDefined();
  });

  it('rejects whitespace-only fields', () => {
    const result = validateContextInput({ resume: '    ', jobDescription: '\n\t ' });

    expect(result.valid).toBe(false);
    expect(result.errors.resume).toContain('required');
    expect(result.errors.jobDescription).toContain('required');
  });

  it('rejects non-string values', () => {
    const result = validateContextInput({
      resume: 42 as unknown as string,
      jobDescription: null as unknown as string,
    });

    expect(result.valid).toBe(false);
  });

  it('rejects too-short context', () => {
    const result = validateContextInput({ resume: 'short', jobDescription: 'short' });

    expect(result.valid).toBe(false);
    expect(result.errors.resume).toContain('at least');
    expect(result.errors.jobDescription).toContain('at least');
  });

  it('rejects oversized context', () => {
    const result = validateContextInput({
      resume: 'x'.repeat(CONTEXT_LIMITS.resumeMaxChars + 1),
      jobDescription: 'y'.repeat(CONTEXT_LIMITS.jobDescriptionMaxChars + 1),
    });

    expect(result.valid).toBe(false);
    expect(result.errors.resume).toContain('at most');
    expect(result.errors.jobDescription).toContain('at most');
  });

  it('accepts and trims valid context', () => {
    const result = validateContextInput({
      resume: '  Senior frontend engineer with React and TypeScript experience.  ',
      jobDescription: '  Build real-time products with a TypeScript and React stack.  ',
    });

    expect(result.valid).toBe(true);
    expect(result.value?.resume.startsWith('Senior')).toBe(true);
    expect(result.value?.jobDescription.startsWith('Build')).toBe(true);
  });
});
