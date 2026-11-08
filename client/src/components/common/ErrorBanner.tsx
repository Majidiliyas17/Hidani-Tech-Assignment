import { AlertTriangle, Info, X } from 'lucide-react';
import type { AppErrorState } from '../../app/interviewReducer';

export function ErrorBanner({
  error,
  onDismiss,
}: {
  error: AppErrorState | null;
  onDismiss: () => void;
}) {
  if (!error) return null;

  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            {error.fatal ? 'Session error' : 'Something needs attention'}
          </span>
          <span className="rounded border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 font-mono text-xs text-red-300">
            {error.code}
          </span>
        </div>
        <p className="mt-1 leading-relaxed text-red-200/90">{error.message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 text-red-300/70 transition-colors hover:bg-red-500/10 hover:text-red-200"
        aria-label="Dismiss error"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function NoticeBanner({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return (
    <div
      role="status"
      className="mt-4 flex items-start gap-3 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-200"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded p-1 text-sky-300/70 transition-colors hover:bg-sky-500/10 hover:text-sky-200"
        aria-label="Dismiss notice"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
