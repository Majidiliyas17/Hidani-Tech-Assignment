import type { TranscriptPayload } from '../../types/protocol';

export interface TranscriptSegment {
  id: string;
  text: string;
  receivedAt: number;
  confidence?: number;
}

export const MAX_TRANSCRIPT_SEGMENTS = 500;

/**
 * Appends a final Deepgram segment exactly once and keeps chronological order.
 * (The server also de-duplicates consecutive identical finals.)
 */
export function appendFinalTranscript(
  segments: TranscriptSegment[],
  payload: TranscriptPayload,
): TranscriptSegment[] {
  if (segments.some((segment) => segment.id === payload.id)) return segments;

  const next = [
    ...segments,
    {
      id: payload.id,
      text: payload.text,
      receivedAt: payload.receivedAt,
      ...(payload.confidence !== undefined ? { confidence: payload.confidence } : {}),
    },
  ];
  return next.slice(-MAX_TRANSCRIPT_SEGMENTS);
}
