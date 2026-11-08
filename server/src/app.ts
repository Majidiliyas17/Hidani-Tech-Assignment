import cors from 'cors';
import express, { type Request, type Response } from 'express';
import type { AppConfig } from './config/env';
import { errorHandler, notFoundHandler, securityHeaders } from './middleware/error-handler';
import { WS_PATH } from './types/protocol';

export function createApp(config: AppConfig): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(securityHeaders);
  app.use(
    cors({
      origin: config.clientUrl,
      methods: ['GET', 'POST'],
    }),
  );
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      uptimeSec: Math.round(process.uptime()),
      providers: {
        deepgram: {
          configured: Boolean(config.deepgram.apiKey),
          model: config.deepgram.model,
          sampleRate: config.deepgram.sampleRate,
        },
        groq: {
          configured: Boolean(config.groq.apiKey),
          model: config.groq.model,
        },
      },
      questionDetection: {
        silenceMs: config.question.silenceMs,
        minWords: config.question.minWords,
      },
      websocket: { path: WS_PATH },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
