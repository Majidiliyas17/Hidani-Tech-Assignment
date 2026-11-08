import type { Request, Response, NextFunction } from 'express';

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isJsonParseError = error instanceof SyntaxError && 'body' in error;
  if (isJsonParseError) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Malformed JSON request body.' },
    });
    return;
  }

  console.error('[http] Unhandled request error', {
    cause: error instanceof Error ? error.message : 'unknown',
  });
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error.' },
  });
}
