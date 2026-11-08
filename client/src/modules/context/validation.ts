import type { InterviewContext } from '../../types/protocol';

export const CONTEXT_LIMITS = {
  resumeMinChars: 20,
  resumeMaxChars: 12_000,
  jobDescriptionMinChars: 20,
  jobDescriptionMaxChars: 8_000,
} as const;

export interface ContextErrors {
  resume?: string;
  jobDescription?: string;
}

export interface ContextValidationResult {
  valid: boolean;
  errors: ContextErrors;
  value?: InterviewContext;
}

export function validateContextInput(input: {
  resume?: string;
  jobDescription?: string;
}): ContextValidationResult {
  const errors: ContextErrors = {};
  const resume = (input.resume ?? '').trim();
  const jobDescription = (input.jobDescription ?? '').trim();

  if (!resume) {
    errors.resume = 'Resume / professional summary is required.';
  } else if (resume.length < CONTEXT_LIMITS.resumeMinChars) {
    errors.resume = `Must be at least ${CONTEXT_LIMITS.resumeMinChars} characters.`;
  } else if (resume.length > CONTEXT_LIMITS.resumeMaxChars) {
    errors.resume = `Must be at most ${CONTEXT_LIMITS.resumeMaxChars.toLocaleString()} characters.`;
  }

  if (!jobDescription) {
    errors.jobDescription = 'Job description is required.';
  } else if (jobDescription.length < CONTEXT_LIMITS.jobDescriptionMinChars) {
    errors.jobDescription = `Must be at least ${CONTEXT_LIMITS.jobDescriptionMinChars} characters.`;
  } else if (jobDescription.length > CONTEXT_LIMITS.jobDescriptionMaxChars) {
    errors.jobDescription = `Must be at most ${CONTEXT_LIMITS.jobDescriptionMaxChars.toLocaleString()} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, errors: {}, value: { resume, jobDescription } };
}
