/**
 * Downsamples mono float audio to 16 kHz signed 16-bit PCM (little-endian when
 * sent as an ArrayBuffer), which is what Deepgram receives as `linear16`.
 * Uses simple box averaging to reduce aliasing.
 */
export function downsampleToPcm16(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate = 16_000,
): Int16Array {
  if (input.length === 0) return new Int16Array(0);

  if (inputSampleRate === outputSampleRate) {
    return floatToPcm16(input);
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += input[j] ?? 0;
      count += 1;
    }
    const sample = count > 0 ? sum / count : (input[start] ?? 0);
    output[i] = clampToPcm16(sample);
  }

  return output;
}

function floatToPcm16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    output[i] = clampToPcm16(input[i] ?? 0);
  }
  return output;
}

function clampToPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
}
