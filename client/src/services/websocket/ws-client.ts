import type { ClientMessage, ServerMessage } from '../../types/protocol';

export type SocketConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface InterviewSocketHandlers {
  onMessage(message: ServerMessage): void;
  onStateChange(state: SocketConnectionState): void;
}

const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 8_000;
const JITTER_MS = 250;
const MAX_BUFFERED_BYTES = 1_000_000;

function isServerMessage(value: unknown): value is ServerMessage {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && typeof (value as { payload?: unknown }).payload === 'object';
}

/**
 * Typed wrapper around the native WebSocket with bounded exponential backoff.
 * Audio is dropped (never queued unboundedly) when the socket is down.
 */
export class InterviewSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private attempts = 0;
  private manualClose = false;
  private state: SocketConnectionState = 'disconnected';

  constructor(
    private readonly url: string,
    private readonly handlers: InterviewSocketHandlers,
  ) {}

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get connectionState(): SocketConnectionState {
    return this.state;
  }

  connect(): void {
    if (this.socket) return;
    this.manualClose = false;
    this.attempts = 0;
    this.setState('connecting');
    this.open();
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearReconnectTimer();

    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close(1000, 'client disconnect');
      } catch {
        // Already closed.
      }
    }
    this.setState('disconnected');
  }

  sendJson(message: ClientMessage): boolean {
    if (!this.isOpen || !this.socket) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  sendBinary(chunk: ArrayBuffer): boolean {
    if (!this.isOpen || !this.socket) return false;
    if (this.socket.bufferedAmount > MAX_BUFFERED_BYTES) return false;
    try {
      this.socket.send(chunk);
      return true;
    } catch {
      return false;
    }
  }

  private open(): void {
    const socket = new WebSocket(this.url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempts = 0;
      this.setState('connected');
    };

    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (isServerMessage(parsed)) {
          this.handlers.onMessage(parsed);
        }
      } catch {
        // Ignore malformed frames; the protocol is server-controlled.
      }
    };

    socket.onerror = () => {
      // The browser fires `close` afterwards; reconnection is handled there.
    };

    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      if (this.manualClose) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.manualClose || this.reconnectTimer !== null) return;

    const delay =
      Math.min(MAX_RECONNECT_DELAY_MS, INITIAL_RECONNECT_DELAY_MS * 2 ** this.attempts) +
      Math.random() * JITTER_MS;
    this.attempts += 1;
    this.setState('reconnecting');

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.manualClose) this.open();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(state: SocketConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.handlers.onStateChange(state);
  }
}
