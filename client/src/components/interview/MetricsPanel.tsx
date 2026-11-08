import { Activity, Clock, Timer, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AnswerMetrics } from '../../types/protocol';
import { formatClock, formatDuration } from '../../utils/format';
import { Card, CardHeader } from '../common/Card';
import { StatusPill } from '../common/StatusPill';

function MetricRow({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs text-zinc-300">{label}</p>
          <p className="text-xs text-zinc-600">{hint}</p>
        </div>
      </div>
      <span className="shrink-0 font-mono text-sm tabular-nums text-zinc-200">{value}</span>
    </div>
  );
}

export function MetricsPanel({ metrics }: { metrics: AnswerMetrics | null }) {
  const ttft = metrics?.ttftMs ?? null;
  const targetMet = ttft === null ? null : ttft <= 3_000;

  return (
    <Card>
      <CardHeader
        icon={Activity}
        title="Latency"
        subtitle="Measured server-side, never estimated"
        action={
          targetMet === null ? (
            <StatusPill label="Waiting" tone="zinc" />
          ) : targetMet ? (
            <StatusPill label="< 3 s target met" tone="emerald" />
          ) : (
            <StatusPill label="Above 3 s target" tone="amber" />
          )
        }
      />

      <div className="divide-y divide-zinc-800/60 px-5 py-2">
        <MetricRow
          icon={Clock}
          label="Question completed"
          hint="Endpoint timestamp"
          value={metrics ? formatClock(metrics.questionCompletedAt) : '—'}
        />
        <MetricRow
          icon={Zap}
          label="Time to first token"
          hint="Question end → first Groq token"
          value={formatDuration(metrics?.ttftMs)}
        />
        <MetricRow
          icon={Timer}
          label="Total answer time"
          hint="Question end → stream complete"
          value={formatDuration(metrics?.totalMs)}
        />
      </div>

      <p className="border-t border-zinc-800/60 px-5 py-3 text-xs leading-relaxed text-zinc-600">
        TTFT includes Deepgram endpointing, prompt construction and Groq’s queue + first token.
        Generation time (Groq request → complete) is{' '}
        <span className="font-mono text-zinc-500">{formatDuration(metrics?.generationMs)}</span>.
      </p>
    </Card>
  );
}
