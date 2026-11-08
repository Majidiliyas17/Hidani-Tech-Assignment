export type ErrorCode =
  | 'CONFIG_INVALID'
  | 'INVALID_MESSAGE'
  | 'AUDIO_INVALID'
  | 'SESSION_ALREADY_ACTIVE'
  | 'SESSION_NOT_ACTIVE'
  | 'CONTEXT_INVALID'
  | 'CONTEXT_REQUIRED'
  | 'PROVIDER_AUTH'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_QUOTA'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_MODEL'
  | 'ANSWER_IN_PROGRESS'
  | 'INTERNAL';

export interface AppErrorOptions {
  fatal?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fatal: boolean;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fatal = options.fatal ?? false;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || /aborted|abort/i.test(error.message);
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError('INTERNAL', error.message, { cause: error });
  }
  return new AppError('INTERNAL', 'An unexpected error occurred.', { cause: error });
}

/** Safe, user-facing serialization. Never includes stack traces or provider secrets. */
export function toErrorPayload(
  error: unknown,
  answerId?: string,
): {
  code: string;
  message: string;
  fatal: boolean;
  answerId?: string;
} {
  const appError = toAppError(error);
  return {
    code: appError.code,
    message: appError.message,
    fatal: appError.fatal,
    ...(answerId ? { answerId } : {}),
  };
}
