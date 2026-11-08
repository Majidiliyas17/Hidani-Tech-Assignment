import { MessageSquare, Radio, Sparkles } from 'lucide-react';
import { getQuestionDetectionView } from '../../modules/questions/detection-state';
import type { DetectedQuestion, SessionState } from '../../types/protocol';
import { formatClock } from '../../utils/format';
import { Card, CardHeader } from '../common/Card';
import { StatusPill } from '../common/StatusPill';

export function QuestionPanel({
  question,
  questionCount,
  session,
  hasInterim,
  isThinking,
}: {
  question: DetectedQuestion | null;
  questionCount: number;
  session: SessionState;
  hasInterim: boolean;
  isThinking: boolean;
}) {
  const detectionState = getQuestionDetectionView({ session, hasInterim, isThinking });

  return (
    <Card>
      <CardHeader
        icon={MessageSquare}
        title="Detected question"
        subtitle="Rule-based endpointing · no LLM call per transcript update"
        action={
          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs tabular-nums text-zinc-500">
            {questionCount} detected
          </span>
        }
      />

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            label={detectionState.label}
            tone={detectionState.tone}
            pulse={detectionState.pulse}
          />
          {question?.isFollowUp ? (
            <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300">
              Follow-up
            </span>
          ) : null}
        </div>

        {question ? (
          <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-zinc-900/20 to-transparent p-4">
            <p className="text-[15px] font-medium leading-relaxed text-zinc-100">
              “{question.text}”
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Radio className="h-3 w-3" />
                {formatClock(question.detectedAt)}
              </span>
              <span>confidence {Math.round(question.score * 100)}%</span>
              <span className="font-mono uppercase tracking-wide text-zinc-600">
                {question.category}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/30 px-4 py-8 text-center">
            <Sparkles className="h-5 w-5 text-zinc-700" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-zinc-400">
              Waiting for the first complete question
            </p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-600">
              Speech is transcribed live. A question is promoted here only after Deepgram
              endpointing (or the silence fallback) and a rule-based completeness check.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
