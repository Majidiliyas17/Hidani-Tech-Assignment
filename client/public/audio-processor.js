/**
 * AudioWorklet: mixes all input channels to mono and emits fixed-size
 * Float32 chunks (~85 ms at 48 kHz) to the main thread for resampling.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requested = options?.processorOptions?.chunkSize;
    this.chunkSize = Number.isInteger(requested) && requested > 0 ? requested : 4096;
    this.buffer = new Float32Array(this.chunkSize);
    this.offset = 0;
  }

  process(inputs) {
    const activeInputs = inputs.filter((input) => input.length > 0 && input[0]);
    if (activeInputs.length === 0) return true;

    const frameCount = activeInputs[0][0].length;

    for (let frame = 0; frame < frameCount; frame += 1) {
      let sum = 0;
      for (const input of activeInputs) {
        let inputSum = 0;
        for (let channel = 0; channel < input.length; channel += 1) {
          inputSum += input[channel]?.[frame] ?? 0;
        }
        sum += inputSum / input.length;
      }
      this.buffer[this.offset] = sum / Math.sqrt(activeInputs.length);
      this.offset += 1;

      if (this.offset === this.chunkSize) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(this.chunkSize);
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
