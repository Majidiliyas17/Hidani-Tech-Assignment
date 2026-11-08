import type { InterviewContext } from '../../types/protocol';
import { AppError } from '../../utils/errors';

export const CONTEXT_LIMITS = {
  resumeMinChars: 20,
  resumeMaxChars: 12_000,
  jobDescriptionMinChars: 20,
  jobDescriptionMaxChars: 8_000,
} as const;

export interface ContextValidationResult {
  valid: boolean;
  errors: {
    resume?: string;
    jobDescription?: string;
  };
  value?: InterviewContext;
}

/**
 * Validates the candidate context. Kept as a pure function so the same rules can
 * be tested directly and mirrored on the client.
 */
export function validateContextInput(input: {
  resume?: unknown;
  jobDescription?: unknown;
}): ContextValidationResult {
  const errors: ContextValidationResult['errors'] = {};
  const resume = typeof input.resume === 'string' ? input.resume.trim() : '';
  const jobDescription =
    typeof input.jobDescription === 'string' ? input.jobDescription.trim() : '';

  if (!resume) {
    errors.resume = 'Resume / professional summary is required.';
  } else if (resume.length < CONTEXT_LIMITS.resumeMinChars) {
    errors.resume = `Resume / professional summary must be at least ${CONTEXT_LIMITS.resumeMinChars} characters.`;
  } else if (resume.length > CONTEXT_LIMITS.resumeMaxChars) {
    errors.resume = `Resume / professional summary must be at most ${CONTEXT_LIMITS.resumeMaxChars} characters.`;
  }

  if (!jobDescription) {
    errors.jobDescription = 'Job description is required.';
  } else if (jobDescription.length < CONTEXT_LIMITS.jobDescriptionMinChars) {
    errors.jobDescription = `Job description must be at least ${CONTEXT_LIMITS.jobDescriptionMinChars} characters.`;
  } else if (jobDescription.length > CONTEXT_LIMITS.jobDescriptionMaxChars) {
    errors.jobDescription = `Job description must be at most ${CONTEXT_LIMITS.jobDescriptionMaxChars} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    value: { resume, jobDescription },
  };
}

/** Server-side in-memory context for one WebSocket connection/session. */
export class ContextService {
  private context: InterviewContext | null = null;

  set(input: { resume?: unknown; jobDescription?: unknown }): InterviewContext {
    const result = validateContextInput(input);
    if (!result.valid || !result.value) {
      const message = Object.values(result.errors).filter(Boolean).join(' ');
      throw new AppError('CONTEXT_INVALID', message);
    }
    this.context = result.value;
    return this.context;
  }

  get(): InterviewContext | null {
    return this.context;
  }

  clear(): void {
    this.context = null;
  }
}
