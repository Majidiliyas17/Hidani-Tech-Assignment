import { z } from 'zod';
import type { ClientMessage } from '../types/protocol';
import { AppError } from '../utils/errors';

const contextSchema = z.object({
  resume: z.string(),
  jobDescription: z.string(),
});

const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session:start'),
    payload: z.object({
      context: contextSchema,
      source: z.enum(['microphone', 'tab']),
    }),
  }),
  z.object({
    type: z.literal('session:stop'),
    payload: z
      .object({
        reason: z.string().max(120).optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('context:update'),
    payload: z.object({
      context: contextSchema,
    }),
  }),
]);

/** Validates untrusted WebSocket JSON before it reaches session logic. */
export function parseClientMessage(raw: string): ClientMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError('INVALID_MESSAGE', 'Malformed JSON WebSocket message.');
  }

  const result = clientMessageSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError('INVALID_MESSAGE', 'Unsupported or invalid WebSocket message.');
  }

  return result.data;
}
