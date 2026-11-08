import { downsampleToPcm16 } from './downsample';

export interface AudioCaptureHandlers {
  onChunk(pcm: Int16Array): void;
  onEnded(): void;
  onError?(message: string): void;
}

export type AudioCaptureErrorCode =
  'UNSUPPORTED' | 'PERMISSION_DENIED' | 'NO_AUDIO_TRACK' | 'DUPLICATE' | 'FAILED';

export class AudioCaptureError extends Error {
  constructor(
    readonly code: AudioCaptureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AudioCaptureError';
  }
}

interface ExtendedDisplayMediaOptions extends DisplayMediaStreamOptions {
  selfBrowserSurface?: 'exclude' | 'include';
  systemAudio?: 'exclude' | 'include';
  surfaceSwitching?: 'exclude' | 'include';
}

export type CaptureSource = 'microphone' | 'tab';

function mapMediaError(error: unknown, source: CaptureSource): AudioCaptureError {
  if (error instanceof AudioCaptureError) return error;
  const name = error instanceof DOMException ? error.name : '';

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new AudioCaptureError(
      'PERMISSION_DENIED',
      source === 'tab'
        ? 'Screen-share permission was denied. Choose a browser tab and tick “Share tab audio”, then try again.'
        : 'Microphone permission was denied. Allow microphone access in your browser and try again.',
    );
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new AudioCaptureError(
      'NO_AUDIO_TRACK',
      source === 'tab'
        ? 'The shared source did not provide audio. Share a browser tab and enable “Share tab audio”.'
        : 'No microphone was found on this device.',
    );
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new AudioCaptureError(
      'FAILED',
      'The audio source is busy or could not be started. Close other capture apps and try again.',
    );
  }
  if (name === 'AbortError') {
    return new AudioCaptureError('PERMISSION_DENIED', 'Audio capture was cancelled.');
  }

  return new AudioCaptureError(
    'FAILED',
    'Could not start audio capture. Check browser permissions and try again.',
  );
}

/**
 * Browser capture pipeline:
 *   tab and/or microphone MediaStreams → AudioWorklet (mono, ~85 ms frames)
 *   → 16 kHz Int16 PCM → WebSocket binary frames.
 *
 * Keeps only the current stream in memory and releases every track on stop.
 */
export class AudioCapture {
  private streams: MediaStream[] = [];
  private context: AudioContext | null = null;
  private sourceNodes: MediaStreamAudioSourceNode[] = [];
  private workletNode: AudioWorkletNode | null = null;
  private sinkNode: GainNode | null = null;
  private tracks: MediaStreamTrack[] = [];
  private endedHandler: (() => void) | null = null;
  private active = false;

  get isActive(): boolean {
    return this.active;
  }

  async start(
    source: CaptureSource,
    handlers: AudioCaptureHandlers,
    options: { includeMicrophone?: boolean } = {},
  ): Promise<void> {
    if (this.active) {
      throw new AudioCaptureError('DUPLICATE', 'Audio capture is already running.');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new AudioCaptureError(
        'UNSUPPORTED',
        'Audio capture requires a modern browser and a secure context (localhost or HTTPS).',
      );
    }
    if (source === 'tab' && !navigator.mediaDevices.getDisplayMedia) {
      throw new AudioCaptureError(
        'UNSUPPORTED',
        'Tab/system audio sharing is not supported by this browser. Use the microphone instead.',
      );
    }

    const streams: MediaStream[] = [];
    try {
      streams.push(await this.requestStream(source));
    } catch (error) {
      throw mapMediaError(error, source);
    }

    if (source === 'tab' && options.includeMicrophone) {
      try {
        streams.push(await this.requestStream('microphone'));
      } catch (error) {
        streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
        throw mapMediaError(error, 'microphone');
      }
    }

    const tabStream = streams[0];
    const tabAudioTrack = tabStream?.getAudioTracks()[0];
    const audioStreams = streams.filter((stream) => stream.getAudioTracks().length > 0);
    if (audioStreams.length === 0) {
      const displaySurface = tabStream?.getVideoTracks()[0]?.getSettings().displaySurface;
      streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      throw new AudioCaptureError(
        'NO_AUDIO_TRACK',
        source === 'tab'
          ? displaySurface && displaySurface !== 'browser'
            ? 'The shared source is not a browser tab. Choose the meeting tab in the share picker and enable “Share tab audio”.'
            : 'No tab audio was shared. In the browser share picker, choose the meeting tab and enable “Share tab audio”.'
          : 'No audio track was provided by the microphone.',
      );
    }

    if (source === 'tab' && !tabAudioTrack && options.includeMicrophone) {
      handlers.onError?.(
        'The shared tab did not provide audio, so only your microphone will be transcribed. Re-share the meeting tab and enable “Share tab audio” to capture both.',
      );
    }
    streams
      .flatMap((stream) => stream.getAudioTracks())
      .forEach((track) => {
        track.contentHint = 'speech';
      });

    this.active = true;
    this.streams = streams;
    this.tracks = streams.flatMap((stream) => stream.getTracks());

    try {
      const context = new AudioContext({ latencyHint: 'interactive' });
      this.context = context;
      if (context.state === 'suspended') {
        await context.resume();
      }

      await context.audioWorklet.addModule('/audio-processor.js');

      const sourceNodes = audioStreams.map((stream) =>
        context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())),
      );
      const workletNode = new AudioWorkletNode(context, 'pcm-capture-processor', {
        numberOfInputs: sourceNodes.length,
        numberOfOutputs: 1,
        channelCount: 1,
        processorOptions: { chunkSize: 4096 },
      });
      const sinkNode = context.createGain();
      sinkNode.gain.value = 0;

      sourceNodes.forEach((sourceNode, inputIndex) =>
        sourceNode.connect(workletNode, 0, inputIndex),
      );
      workletNode.connect(sinkNode);
      sinkNode.connect(context.destination);

      this.sourceNodes = sourceNodes;
      this.workletNode = workletNode;
      this.sinkNode = sinkNode;

      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!this.active) return;
        const samples = event.data;
        if (!(samples instanceof Float32Array) || samples.length === 0) return;
        const pcm = downsampleToPcm16(samples, context.sampleRate);
        if (pcm.length > 0) handlers.onChunk(pcm);
      };

      workletNode.onprocessorerror = () => {
        handlers.onError?.('Audio processing stopped unexpectedly. Stop and restart listening.');
      };

      this.endedHandler = () => {
        if (!this.active) return;
        void this.stop().finally(() => handlers.onEnded());
      };
      this.tracks.forEach((track) => track.addEventListener('ended', this.endedHandler!));
    } catch (error) {
      await this.release();
      throw mapMediaError(error, source);
    }
  }

  async stop(): Promise<void> {
    if (!this.active && this.streams.length === 0 && !this.context) return;
    this.active = false;
    await this.release();
  }

  private async requestStream(source: CaptureSource): Promise<MediaStream> {
    if (source === 'tab') {
      const options: ExtendedDisplayMediaOptions = {
        video: true,
        // A boolean audio request is the most interoperable option for display capture.
        // Track-specific processing constraints are applied by the browser after sharing.
        audio: true,
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'exclude',
      };
      return navigator.mediaDevices.getDisplayMedia(options);
    }

    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
  }

  private async release(): Promise<void> {
    this.active = false;

    if (this.endedHandler) {
      this.tracks.forEach((track) => track.removeEventListener('ended', this.endedHandler!));
    }
    this.endedHandler = null;
    this.tracks.forEach((track) => track.stop());
    this.tracks = [];
    this.streams = [];

    if (this.workletNode) {
      try {
        this.workletNode.port.close();
        this.workletNode.disconnect();
      } catch {
        // Already disconnected.
      }
      this.workletNode = null;
    }

    try {
      this.sourceNodes.forEach((sourceNode) => sourceNode.disconnect());
      this.sinkNode?.disconnect();
    } catch {
      // Already disconnected.
    }
    this.sourceNodes = [];
    this.sinkNode = null;

    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') {
      try {
        await context.close();
      } catch {
        // Context may have been closed by the browser.
      }
    }
  }
}
