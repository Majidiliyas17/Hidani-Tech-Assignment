import { AlertCircle, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import type { AnswerRecord } from '../../modules/answers/answer-state';
import { cn, formatDuration } from '../../utils/format';
import { Card, CardHeader } from '../common/Card';
import { StatusPill } from '../common/StatusPill';

function statusConfig(status: AnswerRecord['status']) {
  if (status === 'streaming') {
    return { label: 'Streaming', tone: 'indigo' as const, pulse: true };
  }
  if (status === 'completed') {
    return { label: 'Complete', tone: 'emerald' as const, pulse: false };
  }
  return { label: 'Failed', tone: 'red' as const, pulse: false };
}

export function AnswerPanel({
  answers,
  activeAnswerId,
}: {
  answers: AnswerRecord[];
  activeAnswerId: string | null;
}) {
  const current =
    answers.find((answer) => answer.answerId === activeAnswerId) ??
    answers[answers.length - 1] ??
    null;
  const previous = current
    ? answers
        .filter((answer) => answer.answerId !== current.answerId)
        .slice()
        .reverse()
    : [];
  const status = current ? statusConfig(current.status) : null;
  const thinking = current?.status === 'streaming' && current.text.length === 0;

  return (
    <Card className={cn(current?.status === 'streaming' && 'border-indigo-500/30')}>
      <CardHeader
        icon={Sparkles}
        title="AI answer"
        subtitle="Groq streams tokens as they are generated"
        action={
          status ? (
            <StatusPill label={status.label} tone={status.tone} pulse={status.pulse} />
          ) : (
            <span className="text-xs uppercase tracking-wider text-zinc-600">Standby</span>
          )
        }
      />

      <div className="p-5">
        {!current ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/30 px-4 py-10 text-center">
            <Sparkles className="h-5 w-5 text-zinc-700" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-zinc-400">The answer will stream here</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-600">
              Once a question is detected, the backend builds a prompt from your saved resume and
              job description and streams the Groq response token by token.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs leading-relaxed text-zinc-500">
              <span className="font-medium text-zinc-400">Question:</span> {current.questionText}
            </p>

            <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
              {thinking ? (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                  <span>Thinking…</span>
                  <span className="flex items-center gap-1">
                    <span
                      className="h-1 w-1 animate-bounce rounded-full bg-indigo-400"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="h-1 w-1 animate-bounce rounded-full bg-indigo-400"
                      style={{ animationDelay: '120ms' }}
                    />
                    <span
                      className="h-1 w-1 animate-bounce rounded-full bg-indigo-400"
                      style={{ animationDelay: '240ms' }}
                    />
                  </span>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">
                  {current.text}
                  {current.status === 'streaming' ? (
                    <span
                      className="answer-cursor ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-indigo-400"
                      aria-hidden="true"
                    />
                  ) : null}
                </p>
              )}

              {current.status === 'error' ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{current.error ?? 'Answer generation failed.'}</span>
                </div>
              ) : null}

              {current.metrics ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800/70 pt-3 text-xs">
                  <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-400">
                    First token:{' '}
                    <span className="font-mono text-zinc-200">
                      {formatDuration(current.metrics.ttftMs)}
                    </span>
                  </span>
                  <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-400">
                    Total:{' '}
                    <span className="font-mono text-zinc-200">
                      {formatDuration(current.metrics.totalMs)}
                    </span>
                  </span>
                  <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-400">
                    {current.text.trim().split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>
              ) : null}
            </div>

            {previous.length > 0 ? (
              <div className="mt-4 border-t border-zinc-800/70 pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-600">
                  Previous answers ({previous.length})
                </p>
                <div className="space-y-2">
                  {previous.map((answer) => (
                    <details
                      key={answer.answerId}
                      className="group rounded-lg border border-zinc-800/80 bg-zinc-950/30"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200">
                        <span className="truncate">{answer.questionText}</span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-zinc-800/70 px-3 py-2.5">
                        <p className="whitespace-pre-wrap text-xs leading-6 text-zinc-400">
                          {answer.text || answer.error || 'No answer text.'}
                        </p>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}
