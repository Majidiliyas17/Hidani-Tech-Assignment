import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/format';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
type ButtonSize = 'sm' | 'md';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-500 text-white hover:bg-indigo-400 focus-visible:outline-indigo-400 disabled:hover:bg-indigo-500',
  secondary:
    'border border-zinc-700 bg-zinc-800/70 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800 focus-visible:outline-zinc-500',
  danger:
    'bg-red-500/90 text-white hover:bg-red-500 focus-visible:outline-red-400 disabled:hover:bg-red-500/90',
  success:
    'bg-emerald-500 text-emerald-950 hover:bg-emerald-400 focus-visible:outline-emerald-400 disabled:hover:bg-emerald-500',
  ghost: 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200 focus-visible:outline-zinc-500',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm gap-2',
  md: 'h-11 px-5 text-base gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
});
