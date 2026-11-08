import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { initialInterviewState, interviewReducer } from '../app/interviewReducer';
import type { AnswerRecord } from '../modules/answers/answer-state';
import { AudioCapture, AudioCaptureError } from '../modules/audio/capture';
import { validateContextInput, type ContextValidationResult } from '../modules/context/validation';
import { InterviewSocket } from '../services/websocket/ws-client';
import type { AudioSource, InterviewContext } from '../types/protocol';
import { WS_URL } from '../utils/config';

const EMPTY_CONTEXT: InterviewContext = { resume: '', jobDescription: '' };

export function useInterviewSession() {
  const [state, dispatch] = useReducer(interviewReducer, initialInterviewState);
  const [savedContext, setSavedContext] = useState<InterviewContext>(EMPTY_CONTEXT);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [tabSupported] = useState(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia),
  );
  const [source, setSourceState] = useState<AudioSource>(tabSupported ? 'tab' : 'microphone');
  const [includeMicrophoneWithTab, setIncludeMicrophoneWithTab] = useState(true);

  const socketRef = useRef<InterviewSocket | null>(null);
  const captureRef = useRef<AudioCapture | null>(null);
  const contextRef = useRef<InterviewContext>(EMPTY_CONTEXT);
  const sourceRef = useRef<AudioSource>(tabSupported ? 'tab' : 'microphone');
  const shouldBeLiveRef = useRef(false);
  const liveRef = useRef(false);
  const audioEnabledRef = useRef(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);

  const stopInternal = useCallback(async (reason: 'user' | 'audio-ended') => {
    const wasLive = liveRef.current || shouldBeLiveRef.current;
    liveRef.current = false;
    shouldBeLiveRef.current = false;
    audioEnabledRef.current = false;

    await captureRef.current?.stop();

    if (wasLive && socketRef.current?.isOpen) {
      socketRef.current.sendJson({ type: 'session:stop', payload: { reason } });
    }
    if (reason === 'audio-ended') {
      dispatch({
        type: 'notice',
        message: 'The shared audio source ended, so listening stopped.',
      });
    }
  }, []);

  const startListening = useCallback(
    async (nextSource?: AudioSource) => {
      if (startingRef.current || liveRef.current) return;

      const socket = socketRef.current;
      if (!socket?.isOpen) {
        dispatch({
          type: 'local-error',
          code: 'CONNECTION_REQUIRED',
          message:
            'The backend connection is not ready. Wait for “Connected” (or restart the server) and try again.',
        });
        return;
      }

      const validation = validateContextInput(contextRef.current);
      if (!validation.valid) {
        dispatch({
          type: 'local-error',
          code: 'CONTEXT_REQUIRED',
          message: 'Save a resume / professional summary and a job description before starting.',
        });
        return;
      }

      const selectedSource = nextSource ?? sourceRef.current;
      startingRef.current = true;
      setIsStarting(true);
      setCaptureError(null);
      sourceRef.current = selectedSource;
      setSourceState(selectedSource);
      dispatch({ type: 'session-starting' });

      const capture = captureRef.current ?? new AudioCapture();
      captureRef.current = capture;

      try {
        await capture.start(
          selectedSource,
          {
            onChunk: (pcm) => {
              if (!audioEnabledRef.current) return;
              socketRef.current?.sendBinary(pcm.buffer as ArrayBuffer);
            },
            onEnded: () => {
              void stopInternal('audio-ended');
            },
            onError: (message) => {
              setCaptureError(message);
            },
          },
          {
            includeMicrophone: selectedSource === 'tab' && includeMicrophoneWithTab,
          },
        );

        if (!mountedRef.current) {
          await capture.stop();
          return;
        }

        liveRef.current = true;
        shouldBeLiveRef.current = true;

        const sent = socket.sendJson({
          type: 'session:start',
          payload: {
            context: contextRef.current,
            source: selectedSource,
          },
        });
        if (!sent) {
          throw new Error('The backend connection dropped. Reconnecting — try again.');
        }
        // Send control frame before audio so the server never sees orphan chunks.
        audioEnabledRef.current = true;
      } catch (error) {
        liveRef.current = false;
        shouldBeLiveRef.current = false;
        audioEnabledRef.current = false;
        await capture.stop();
        dispatch({ type: 'session-aborted' });

        const message =
          error instanceof AudioCaptureError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Could not start the listening session.';
        setCaptureError(message);
        dispatch({
          type: 'local-error',
          code: error instanceof AudioCaptureError ? error.code : 'AUDIO_FAILED',
          message,
        });
      } finally {
        startingRef.current = false;
        if (mountedRef.current) setIsStarting(false);
      }
    },
    [includeMicrophoneWithTab, stopInternal],
  );

  const stopListening = useCallback(async () => {
    await stopInternal('user');
  }, [stopInternal]);

  const saveContext = useCallback((draft: InterviewContext): ContextValidationResult => {
    const result = validateContextInput(draft);
    if (!result.valid || !result.value) return result;

    contextRef.current = result.value;
    setSavedContext(result.value);
    setSavedAt(Date.now());
    socketRef.current?.sendJson({
      type: 'context:update',
      payload: { context: result.value },
    });
    return result;
  }, []);

  const setSource = useCallback((next: AudioSource) => {
    if (liveRef.current || startingRef.current) return;
    sourceRef.current = next;
    setSourceState(next);
  }, []);

  const dismissError = useCallback(() => dispatch({ type: 'dismiss-error' }), []);
  const dismissNotice = useCallback(() => dispatch({ type: 'dismiss-notice' }), []);

  useEffect(() => {
    mountedRef.current = true;

    const socket = new InterviewSocket(WS_URL, {
      onMessage: (message) => dispatch({ type: 'server-message', message }),
      onStateChange: (connection) => dispatch({ type: 'connection', state: connection }),
    });
    socketRef.current = socket;
    socket.connect();

    return () => {
      mountedRef.current = false;
      shouldBeLiveRef.current = false;
      liveRef.current = false;
      audioEnabledRef.current = false;
      startingRef.current = false;
      void captureRef.current?.stop();
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (state.connection !== 'connected') {
      audioEnabledRef.current = false;
      return;
    }
    if (!shouldBeLiveRef.current) return;

    const socket = socketRef.current;
    if (!socket?.isOpen) return;

    // Reconnected: the server session died with the old socket, so restart it
    // transparently and keep streaming the still-open audio source.
    const sent = socket.sendJson({
      type: 'session:start',
      payload: {
        context: contextRef.current,
        source: sourceRef.current,
      },
    });
    audioEnabledRef.current = sent;
  }, [state.connection]);

  useEffect(() => {
    if (state.session !== 'error' && state.session !== 'stopped') return;
    audioEnabledRef.current = false;
    if (!liveRef.current && !shouldBeLiveRef.current) return;

    liveRef.current = false;
    shouldBeLiveRef.current = false;
    void captureRef.current?.stop();
  }, [state.session]);

  const contextReady = validateContextInput(savedContext).valid;
  const isLive = state.session === 'active' || state.session === 'connecting';
  const activeAnswer: AnswerRecord | null =
    state.answers.find((answer) => answer.answerId === state.activeAnswerId) ?? null;

  return {
    state,
    savedContext,
    savedAt,
    isStarting,
    captureError,
    tabSupported,
    source,
    includeMicrophoneWithTab,
    setIncludeMicrophoneWithTab,
    contextReady,
    isLive,
    activeAnswer,
    wsUrl: WS_URL,
    startListening,
    stopListening,
    saveContext,
    setSource,
    dismissError,
    dismissNotice,
  };
}
