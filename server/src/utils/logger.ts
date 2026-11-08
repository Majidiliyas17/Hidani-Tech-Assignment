type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error' ? raw : 'info';
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

/**
 * Tiny structured logger. Callers must never pass raw audio, resumes, job
 * descriptions, transcript text, or API keys in `meta`.
 */
export function createLogger(scope = 'app'): Logger {
  const threshold = SEVERITY[resolveLevel()];

  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (SEVERITY[level] < threshold) return;
    const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (meta) sink(line, meta);
    else sink(line);
  };

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    child: (childScope) => createLogger(`${scope}:${childScope}`),
  };
}
