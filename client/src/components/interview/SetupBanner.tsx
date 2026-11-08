import { RefreshCw, ServerOff, Settings2 } from 'lucide-react';
import type { HealthState } from '../../hooks/useHealthCheck';
import { Button } from '../common/Button';

export function SetupBanner({ health, onRetry }: { health: HealthState; onRetry: () => void }) {
  if (health.status === 'loading') return null;

  if (health.status === 'error') {
    return (
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ServerOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Backend not reachable</p>
            <p className="mt-0.5 text-amber-200/85">{health.error}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onRetry} className="shrink-0">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const providers = health.data.providers;
  const missing = [
    providers.deepgram.configured ? null : 'Deepgram',
    providers.groq.configured ? null : 'Groq',
  ].filter(Boolean);

  if (missing.length > 0) {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        <Settings2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Provider setup incomplete</p>
          <p className="mt-0.5 text-amber-200/85">
            Missing {missing.join(' and ')} configuration. Add the keys to{' '}
            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">.env</code> in the
            project root and restart the backend.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
