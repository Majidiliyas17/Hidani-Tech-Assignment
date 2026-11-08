import { cn } from '../../utils/format';

export type StatusTone = 'emerald' | 'amber' | 'red' | 'zinc' | 'indigo';

const toneClasses: Record<StatusTone, { wrapper: string; dot: string }> = {
  emerald: {
    wrapper: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  amber: {
    wrapper: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
    dot: 'bg-amber-400',
  },
  red: {
    wrapper: 'border-red-500/25 bg-red-500/10 text-red-300',
    dot: 'bg-red-400',
  },
  zinc: {
    wrapper: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
    dot: 'bg-zinc-500',
  },
  indigo: {
    wrapper: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-300',
    dot: 'bg-indigo-400',
  },
};

export function StatusPill({
  label,
  tone = 'zinc',
  pulse = false,
  className,
}: {
  label: string;
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  const styles = toneClasses[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        styles.wrapper,
        className,
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', styles.dot, pulse && 'animate-pulse')}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
