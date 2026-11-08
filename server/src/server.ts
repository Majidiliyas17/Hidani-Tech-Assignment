import http from 'node:http';
import { createApp } from './app';
import { loadConfig, type AppConfig } from './config/env';
import { attachWebSocketServer } from './websocket/socket-server';
import { createLogger } from './utils/logger';

async function bootstrap(): Promise<void> {
  const logger = createLogger('server');

  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown configuration error.';
    console.error(`\n[server] Startup aborted.\n${message}\n`);
    process.exitCode = 1;
    return;
  }

  const app = createApp(config);
  const httpServer = http.createServer(app);
  const wsHandle = attachWebSocketServer(httpServer, config, logger.child('ws'));

  httpServer.on('error', (error) => {
    logger.error('HTTP server error', { cause: error.message });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      httpServer.off('error', onError);
      resolve();
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(config.port);
  });

  logger.info(`API ready on http://localhost:${config.port}`);
  logger.info(`WebSocket ready on ws://localhost:${config.port}/ws`);
  logger.info(`Deepgram model: ${config.deepgram.model} (linear16, 16 kHz mono)`);
  logger.info(`Groq model: ${config.groq.model}`);
  logger.info(`Allowed client origin: ${config.clientUrl}`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Shutting down (${signal})`);

    const forceExit = setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 5_000);
    forceExit.unref();

    try {
      await wsHandle.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Shutdown failed', {
        cause: error instanceof Error ? error.message : 'unknown',
      });
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  console.error('[server] Fatal startup error', {
    cause: error instanceof Error ? error.message : 'unknown',
  });
  process.exit(1);
});
