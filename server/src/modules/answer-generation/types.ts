export interface ChatStreamParams {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  signal: AbortSignal;
}

export interface ChatProvider {
  readonly model: string;
  streamChat(params: ChatStreamParams): AsyncIterable<string>;
}
