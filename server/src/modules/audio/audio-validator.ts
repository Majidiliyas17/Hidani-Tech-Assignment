import { AppError } from '../../utils/errors';

/**
 * 16 kHz mono linear16 = 32,000 bytes/sec.
 * Accept 10 ms (320 bytes) up to 2 s (64,000 bytes) per frame. This rejects
 * empty/garbage payloads without penalising normal ~85 ms browser chunks.
 */
export const AUDIO_CHUNK_MIN_BYTES = 320;
export const AUDIO_CHUNK_MAX_BYTES = 64_000;

export function validateAudioChunk(chunk: Buffer): void {
  if (!Buffer.isBuffer(chunk) || chunk.length < AUDIO_CHUNK_MIN_BYTES) {
    throw new AppError('AUDIO_INVALID', 'Audio chunk is empty or too small.', { fatal: false });
  }
  if (chunk.length > AUDIO_CHUNK_MAX_BYTES) {
    throw new AppError('AUDIO_INVALID', 'Audio chunk is too large.', { fatal: false });
  }
  if (chunk.length % 2 !== 0) {
    // linear16 samples are 2 bytes each.
    throw new AppError('AUDIO_INVALID', 'Audio chunk is not valid 16-bit PCM.', { fatal: false });
  }
}
