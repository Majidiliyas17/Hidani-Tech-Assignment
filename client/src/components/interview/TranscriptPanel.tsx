import { useEffect, useRef } from 'react';
import { AudioLines } from 'lucide-react';
import type { TranscriptSegment } from '../../modules/transcript/transcript-state';
import { formatClock } from '../../utils/format';
import { Card, CardHeader } from '../common/Card';

export function TranscriptPanel({
  finals,
  interim,
  listening,
}: {
  finals: TranscriptSegment[];
  interim: string;
  listening: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !stickToBottomRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [finals.length, interim]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    stickToBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < 48;
  };

  return (
    <Card>
      <CardHeader
        icon={AudioLines}
        title="Live transcript"
        subtitle="Interim results update in place; final segments are ordered"
        action={
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" /> Final
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Interim
            </span>
            <span className="tabular-nums">{finals.length}</span>
          </div>
        }
      />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-[340px] min-h-[180px] overflow-y-auto px-5 py-4"
      >
        {finals.length === 0 && !interim ? (
          <div className="flex h-[150px] flex-col items-center justify-center text-center">
            <AudioLines className="h-5 w-5 text-zinc-700" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-zinc-400">
              {listening ? 'Listening for speech…' : 'Transcript is empty'}
            </p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-600">
              {listening
                ? 'Speak or play the interviewer’s audio. Interim words appear here within a fraction of a second.'
                : 'Start listening to stream Deepgram’s real-time transcription into this panel.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {finals.map((segment) => (
              <div key={segment.id} className="flex items-start gap-3">
                <span className="mt-1 w-16 shrink-0 font-mono text-xs tabular-nums text-zinc-600">
                  {formatClock(segment.receivedAt)}
                </span>
                <p className="text-sm leading-relaxed text-zinc-200">{segment.text}</p>
              </div>
            ))}

            {interim ? (
              <div className="flex items-start gap-3 rounded-lg border-l-2 border-amber-400/60 bg-amber-400/5 py-1.5 pl-2">
                <span className="mt-1 flex w-16 shrink-0 items-center gap-1 font-mono text-xs text-amber-400/80">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-amber-400" />
                  interim
                </span>
                <p className="text-sm italic leading-relaxed text-amber-200/85">{interim}</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <p className="border-t border-zinc-800/60 px-5 py-2.5 text-xs text-zinc-600">
        Only audio chunks are uploaded — the app never stores a full interview recording.
      </p>
    </Card>
  );
}
