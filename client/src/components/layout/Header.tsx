import { AudioLines, Moon, Sun } from 'lucide-react';
import type { ConnectionState, SessionState } from '../../types/protocol';
import { StatusPill, type StatusTone } from '../common/StatusPill';

const CONNECTION_CONFIG: Record<
  ConnectionState,
  { label: string; tone: StatusTone; pulse?: boolean }
> = {
  connected: { label: 'Connected', tone: 'emerald' },
  connecting: { label: 'Connecting', tone: 'amber', pulse: true },
  reconnecting: { label: 'Reconnecting', tone: 'amber', pulse: true },
  disconnected: { label: 'Disconnected', tone: 'red' },
};

const SESSION_CONFIG: Record<SessionState, { label: string; tone: StatusTone; pulse?: boolean }> = {
  idle: { label: 'Idle', tone: 'zinc' },
  connecting: { label: 'Starting', tone: 'amber', pulse: true },
  active: { label: 'Live', tone: 'emerald', pulse: true },
  stopped: { label: 'Stopped', tone: 'zinc' },
  error: { label: 'Session error', tone: 'red' },
};

export function Header({
  connection,
  session,
  isDark,
  onToggleTheme,
}: {
  connection: ConnectionState;
  session: SessionState;
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const connectionConfig = CONNECTION_CONFIG[connection];
  const sessionConfig = SESSION_CONFIG[session];

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/70 bg-zinc-950/85 shadow-sm shadow-slate-900/5 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
            <AudioLines className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
              Interview Copilot
            </h1>
            <p className="text-xs text-zinc-500">Your real-time interview companion</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm font-medium text-zinc-200 shadow-sm transition hover:border-indigo-400/50 hover:text-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="hidden sm:inline">{isDark ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <StatusPill
            label={connectionConfig.label}
            tone={connectionConfig.tone}
            pulse={connectionConfig.pulse}
          />
          <StatusPill
            label={sessionConfig.label}
            tone={sessionConfig.tone}
            pulse={sessionConfig.pulse}
          />
        </div>
      </div>
    </header>
  );
}
