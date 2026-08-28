import React from 'react';
import { Loader2 } from 'lucide-react';

export type VadeButtonVariant = 'solid' | 'outline' | 'text' | 'warn';
export type VadeButtonSize = 'lg' | 'md' | 'sm';

export interface VadeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: VadeButtonVariant;
  size?: VadeButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  /** Stretches to the container. Primary actions at the bottom of a screen are always full width. */
  block?: boolean;
}

/** 52px primary / 44–48px secondary, always a pill. */
const SIZES: Record<VadeButtonSize, string> = {
  lg: 'h-[52px] px-6 text-[15.5px]',
  md: 'h-12 px-5 text-[15px]',
  sm: 'h-11 px-[18px] text-[14.5px]',
};

const VARIANTS: Record<VadeButtonVariant, string> = {
  solid: 'bg-out-bg text-out-fg hover:opacity-90 active:opacity-80',
  outline: 'border border-line text-muted hover:bg-surface active:bg-surface-2',
  text: 'text-muted hover:text-text',
  warn: 'bg-warn text-bg hover:opacity-90 active:opacity-80',
};

export const VadeButton = React.forwardRef<HTMLButtonElement, VadeButtonProps>(
  (
    {
      children,
      variant = 'solid',
      size = 'lg',
      isLoading = false,
      leftIcon,
      block = false,
      disabled,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-full font-bold',
        'transition-opacity duration-150 select-none cursor-pointer',
        'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        SIZES[size],
        VARIANTS[variant],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
    </button>
  )
);

VadeButton.displayName = 'VadeButton';

/**
 * A circular icon-only action. Visual size can stay below the 44px tap target, so the
 * hit area is set independently of the drawn circle.
 */
export const VadeIconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    filled?: boolean;
    /** Drawn diameter in px. The tap target stays at least 44px regardless. */
    diameter?: number;
  }
>(({ label, filled = false, diameter = 34, className = '', children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    style={{ width: diameter, height: diameter }}
    className={[
      'relative shrink-0 inline-flex items-center justify-center rounded-full cursor-pointer',
      'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      // Expands the pointer/touch target to 44px without changing the drawn circle.
      "after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] after:w-11 after:h-11",
      filled ? 'bg-out-bg text-out-fg' : 'text-text hover:bg-surface',
      className,
    ].join(' ')}
    {...props}
  >
    {children}
  </button>
));

VadeIconButton.displayName = 'VadeIconButton';
