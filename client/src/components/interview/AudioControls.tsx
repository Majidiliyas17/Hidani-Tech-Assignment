import { AlertTriangle, Loader2, Mic, Play, ScreenShare, Square } from 'lucide-react';
import type { AudioSource, ConnectionState, SessionState } from '../../types/protocol';
import { cn } from '../../utils/format';
import { Button } from '../common/Button';
import { Card, CardHeader } from '../common/Card';

const SESSION_HINT: Record<SessionState, string> = {
  idle: 'Ready when you are.',
  connecting: 'Connecting to Deepgram…',
  active: 'Streaming audio to Deepgram in real time.',
  stopped: 'Listening stopped.',
  error: 'The session ended with an error. Check the banner above.',
};

const SOURCE_BUTTON_BASE =
  'flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

function sourceButtonClass(active: boolean): string {
  return cn(
    SOURCE_BUTTON_BASE,
    active
      ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-500'
      : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
  );
}

export function AudioControls({
  connection,
  session,
  isStarting,
  isLive,
  source,
  includeMicrophoneWithTab,
  tabSupported,
  contextReady,
  captureError,
  onSourceChange,
  onIncludeMicrophoneWithTabChange,
  onStart,
  onStop,
}: {
  connection: ConnectionState;
  session: SessionState;
  isStarting: boolean;
  isLive: boolean;
  source: AudioSource;
  includeMicrophoneWithTab: boolean;
  tabSupported: boolean;
  contextReady: boolean;
  captureError: string | null;
  onSourceChange: (source: AudioSource) => void;
  onIncludeMicrophoneWithTabChange: (include: boolean) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const connected = connection === 'connected';
  const busy = isStarting || isLive;
  const startDisabled = !connected || busy || !contextReady;

  return (
    <Card>
      <CardHeader
        icon={Mic}
        title="Interview controls"
        subtitle="Capture the interviewer from a browser tab or microphone"
        action={
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {session === 'active' ? 'Live' : session === 'connecting' ? 'Starting' : 'Idle'}
          </span>
        }
      />

      <div className="space-y-5 p-5 sm:p-6">
        {!connected ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {connection === 'reconnecting'
                ? 'Connection lost. Reconnecting automatically — the session resumes when the socket is back.'
                : connection === 'connecting'
                  ? 'Connecting to the backend…'
                  : 'Backend disconnected. Start the server and retry.'}
            </span>
          </div>
        ) : null}

        <div>
          <p className="mb-2.5 text-sm font-semibold text-zinc-200">Audio source</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSourceChange('tab')}
              disabled={busy || !tabSupported}
              aria-pressed={source === 'tab'}
              className={sourceButtonClass(source === 'tab')}
            >
              <ScreenShare className="h-4 w-4" />
              Browser tab audio
            </button>
            <button
              type="button"
              onClick={() => onSourceChange('microphone')}
              disabled={busy}
              aria-pressed={source === 'microphone'}
              className={sourceButtonClass(source === 'microphone')}
            >
              <Mic className="h-4 w-4" />
              Microphone
            </button>
          </div>
          {source === 'tab' ? (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-indigo-500/15 bg-indigo-500/5 px-3.5 py-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={includeMicrophoneWithTab}
                onChange={(event) => onIncludeMicrophoneWithTabChange(event.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
              />
              <span>
                <span className="block font-semibold text-zinc-100">
                  Also capture my microphone
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                  Tab sharing hears audio playing in that tab. Turn this on to include your voice
                  too.
                </span>
              </span>
            </label>
          ) : null}
          <p className="mt-2.5 text-xs leading-relaxed text-zinc-500">
            {source === 'tab'
              ? 'In Chrome or Edge, choose the meeting tab and enable “Share tab audio” in the share picker. Sharing the screen alone will not send tab sound.'
              : !tabSupported
                ? 'This browser does not support tab audio capture; use the microphone or Chrome/Edge.'
                : 'Use headphones to reduce echo. Audio is resampled to 16 kHz mono PCM.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="success" onClick={onStart} disabled={startDisabled}>
            {isStarting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isStarting ? 'Starting…' : 'Start listening'}
          </Button>
          <Button variant="danger" onClick={onStop} disabled={!isLive || isStarting}>
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        </div>

        {!contextReady ? (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/90">
            Save the resume and job description above to unlock Start.
          </p>
        ) : null}

        {captureError ? (
          <p className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {captureError}
          </p>
        ) : null}

        <div className="flex items-center justify-between border-t border-zinc-800/70 pt-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                session === 'active'
                  ? 'animate-pulse bg-emerald-400'
                  : session === 'connecting'
                    ? 'animate-pulse bg-amber-400'
                    : 'bg-zinc-600',
              )}
            />
            {SESSION_HINT[session]}
          </span>
          <span className="hidden font-mono sm:inline">16 kHz · mono · linear16</span>
        </div>
      </div>
    </Card>
  );
}
