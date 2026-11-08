import { describe, expect, it } from 'vitest';
import { ClientSession } from '../src/websocket/client-session';
import { AppError } from '../src/utils/errors';
import {
  FakeChatProvider,
  FakeSocket,
  FakeTranscription,
  failingTranscription,
  makeSessionDeps,
  messagesOfType,
  validContext,
  waitFor,
  type Clock,
} from './helpers';

function setup(
  options: {
    transcription?: FakeTranscription;
    chat?: FakeChatProvider;
    clock?: Clock;
  } = {},
) {
  const socket = new FakeSocket();
  const transcription = options.transcription ?? new FakeTranscription();
  const chat = options.chat ?? new FakeChatProvider();
  const clock = options.clock ?? { value: 1_000_000 };
  const session = new ClientSession(socket, makeSessionDeps(transcription, chat, clock));
  return { socket, transcription, chat, clock, session };
}

function startMessage() {
  return JSON.stringify({
    type: 'session:start',
    payload: { context: validContext, source: 'tab' },
  });
}

async function start(session: ClientSession, socket: FakeSocket): Promise<void> {
  session.handleMessage(startMessage());
  await waitFor(() =>
    messagesOfType(socket, 'session:status').some((message) => message.payload.state === 'active'),
  );
}

describe('ClientSession lifecycle', () => {
  it('starts, forwards audio, streams transcript → question → answer metrics', async () => {
    const { session, socket, transcription, chat } = setup();
    await start(session, socket);

    expect(transcription.connected).toBe(true);
    const states = messagesOfType(socket, 'session:status').map((message) => message.payload.state);
    expect(states).toEqual(['connecting', 'active']);

    session.handleAudio(Buffer.alloc(640, 1));
    expect(transcription.audio).toHaveLength(1);

    transcription.emitInterim('Tell me about');
    expect(messagesOfType(socket, 'transcription:interim')).toHaveLength(1);

    transcription.emitFinal('Tell me about a time you handled conflict.', true);

    await waitFor(() => messagesOfType(socket, 'answer:completed').length === 1);

    expect(messagesOfType(socket, 'transcription:final')).toHaveLength(1);
    expect(messagesOfType(socket, 'question:detected')).toHaveLength(1);
    expect(messagesOfType(socket, 'answer:started')).toHaveLength(1);
    expect(messagesOfType(socket, 'metrics:updated').length).toBeGreaterThan(0);

    const question = messagesOfType(socket, 'question:detected')[0];
    expect(question?.payload.text).toContain('handled conflict');

    const tokens = messagesOfType(socket, 'answer:token')
      .map((message) => message.payload.token)
      .join('');
    expect(tokens).toBe('Answer text');

    const completed = messagesOfType(socket, 'answer:completed')[0];
    expect(completed?.payload.text).toBe('Answer text');
    expect(typeof completed?.payload.metrics.ttftMs).toBe('number');
    expect(typeof completed?.payload.metrics.totalMs).toBe('number');

    expect(chat.calls).toHaveLength(1);
    const prompt = chat.calls[0]?.messages.find((message) => message.role === 'user');
    expect(prompt?.content).toContain(validContext.resume);
    expect(prompt?.content).toContain('handled conflict');
  });

  it('buffers audio while Deepgram is connecting and flushes it on ready', async () => {
    const transcription = new FakeTranscription();
    transcription.connectDelayMs = 40;
    const { session, socket } = setup({ transcription });

    session.handleMessage(startMessage());
    expect(
      messagesOfType(socket, 'session:status').some(
        (message) => message.payload.state === 'connecting',
      ),
    ).toBe(true);

    session.handleAudio(Buffer.alloc(640, 2));
    expect(transcription.audio).toHaveLength(0);

    await waitFor(() =>
      messagesOfType(socket, 'session:status').some(
        (message) => message.payload.state === 'active',
      ),
    );
    expect(transcription.audio).toHaveLength(1);
  });

  it('rejects duplicate active sessions on the same connection', async () => {
    const { session, socket, transcription } = setup();
    await start(session, socket);

    session.handleMessage(startMessage());

    const errors = messagesOfType(socket, 'error');
    expect(errors.at(-1)?.payload.code).toBe('SESSION_ALREADY_ACTIVE');
    expect(transcription.connectCalls).toBe(1);
  });

  it('stops cleanly and closes the provider', async () => {
    const { session, socket, transcription } = setup();
    await start(session, socket);

    session.handleMessage(JSON.stringify({ type: 'session:stop', payload: { reason: 'user' } }));

    const statuses = messagesOfType(socket, 'session:status');
    expect(statuses.at(-1)?.payload.state).toBe('stopped');
    expect(statuses.at(-1)?.payload.detail).toBe('user');
    expect(transcription.closed).toBe(true);
  });

  it('surfaces provider connection failures and cleans up', async () => {
    const transcription = failingTranscription('No Deepgram connection');
    const { session, socket } = setup({ transcription });

    session.handleMessage(startMessage());

    await waitFor(() =>
      messagesOfType(socket, 'session:status').some((message) => message.payload.state === 'error'),
    );

    expect(messagesOfType(socket, 'error').at(-1)?.payload.code).toBe('PROVIDER_UNAVAILABLE');
    expect(transcription.closed).toBe(true);
  });

  it('rejects invalid context before opening a provider connection', async () => {
    const { session, socket, transcription } = setup();

    session.handleMessage(
      JSON.stringify({
        type: 'session:start',
        payload: { context: { resume: '', jobDescription: '' }, source: 'tab' },
      }),
    );

    expect(messagesOfType(socket, 'error').at(-1)?.payload.code).toBe('CONTEXT_INVALID');
    expect(transcription.connectCalls).toBe(0);
    expect(messagesOfType(socket, 'session:status')).toHaveLength(0);
  });

  it('rejects invalid audio payloads', () => {
    const { session, socket } = setup();

    session.handleAudio(Buffer.alloc(3));

    expect(messagesOfType(socket, 'error').at(-1)?.payload.code).toBe('AUDIO_INVALID');
  });

  it('rejects malformed and unknown WebSocket messages', () => {
    const { session, socket } = setup();

    session.handleMessage('{not-json');
    session.handleMessage(JSON.stringify({ type: 'made:up' }));

    const errors = messagesOfType(socket, 'error');
    expect(errors).toHaveLength(2);
    expect(errors.every((error) => error.payload.code === 'INVALID_MESSAGE')).toBe(true);
  });

  it('updates context over the socket and validates it', async () => {
    const { session, socket } = setup();
    await start(session, socket);

    session.handleMessage(
      JSON.stringify({ type: 'context:update', payload: { context: validContext } }),
    );
    expect(messagesOfType(socket, 'context:updated')).toHaveLength(1);

    session.handleMessage(
      JSON.stringify({
        type: 'context:update',
        payload: { context: { resume: '', jobDescription: '' } },
      }),
    );
    expect(messagesOfType(socket, 'error').at(-1)?.payload.code).toBe('CONTEXT_INVALID');
  });

  it('reports answer provider failures without killing the session', async () => {
    const chat = new FakeChatProvider(
      [],
      new AppError('PROVIDER_RATE_LIMIT', 'Groq free-tier rate limit reached.'),
    );
    const { session, socket, transcription } = setup({ chat });
    await start(session, socket);

    transcription.emitFinal('What is your greatest strength?', true);

    await waitFor(() =>
      messagesOfType(socket, 'error').some(
        (message) => message.payload.code === 'PROVIDER_RATE_LIMIT',
      ),
    );

    const error = messagesOfType(socket, 'error').at(-1);
    expect(error?.payload.answerId).toBeDefined();
    expect(messagesOfType(socket, 'answer:completed')).toHaveLength(0);

    const sessionStatus = messagesOfType(socket, 'session:status').at(-1);
    expect(sessionStatus?.payload.state).toBe('active');
  });

  it('ignores future messages after disposal and closes resources', async () => {
    const { session, socket, transcription } = setup();
    await start(session, socket);

    session.dispose();
    expect(transcription.closed).toBe(true);

    const messageCount = socket.messages.length;
    session.handleMessage(JSON.stringify({ type: 'session:stop' }));
    expect(socket.messages).toHaveLength(messageCount);
  });
});
