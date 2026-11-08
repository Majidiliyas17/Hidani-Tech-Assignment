import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import type { AppConfig } from '../config/env';
import { GroqChatProvider } from '../modules/answer-generation/groq.provider';
import { DeepgramTranscriptionProvider } from '../modules/transcription/deepgram.provider';
import { createLogger, type Logger } from '../utils/logger';
import { WS_PATH } from '../types/protocol';
import { ClientSession } from './client-session';

interface AliveSocket extends WebSocket {
  isAlive?: boolean;
}

export interface WebSocketHandle {
  wss: WebSocketServer;
  close(): Promise<void>;
}

/**
 * Attaches the interview WebSocket endpoint to the HTTP server.
 * One socket = one ClientSession, cleaned up on close/error/shutdown.
 */
export function attachWebSocketServer(
  server: HttpServer,
  config: AppConfig,
  logger: Logger = createLogger('ws'),
): WebSocketHandle {
  const wss = new WebSocketServer({
    server,
    path: WS_PATH,
    maxPayload: 2 * 1024 * 1024,
  });

  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const origin = request.headers.origin;
    if (origin && origin !== config.clientUrl) {
      logger.warn('Rejected WebSocket connection from unexpected origin', { origin });
      socket.close(1008, 'Origin not allowed');
      return;
    }

    const connectionId = randomUUID().slice(0, 8);
    const sessionLogger = logger.child(connectionId);
    sessionLogger.info('Client connected');

    const session = new ClientSession(socket, {
      question: config.question,
      logger: sessionLogger,
      createTranscription: (handlers) =>
        new DeepgramTranscriptionProvider(config.deepgram, handlers),
      createChatProvider: () => new GroqChatProvider(config.groq),
    });

    const aliveSocket = socket as AliveSocket;
    aliveSocket.isAlive = true;
    socket.on('pong', () => {
      aliveSocket.isAlive = true;
    });

    socket.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        const chunk = Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.isBuffer(data)
            ? data
            : Buffer.from(data);
        session.handleAudio(chunk);
        return;
      }
      session.handleMessage(data.toString());
    });

    socket.on('close', () => {
      session.dispose();
      sessionLogger.info('Client disconnected');
    });

    socket.on('error', () => {
      session.dispose();
      sessionLogger.warn('Client socket error');
    });
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const aliveSocket = client as AliveSocket;
      if (aliveSocket.isAlive === false) {
        aliveSocket.terminate();
        continue;
      }
      aliveSocket.isAlive = false;
      safePing(aliveSocket);
    }
  }, 30_000);
  heartbeat.unref?.();

  return {
    wss,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        for (const client of wss.clients) {
          client.terminate();
        }
        wss.close(() => resolve());
      }),
  };
}

function safePing(socket: WebSocket): void {
  try {
    socket.ping();
  } catch {
    socket.terminate();
  }
}
