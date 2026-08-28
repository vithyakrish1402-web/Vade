import React, { useId, useState } from 'react';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';

export interface VadeFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Rendered above the field only where the placeholder alone would be ambiguous. */
  label?: string;
  helperText?: string;
  error?: string | null;
}

/**
 * The pill input: 52px, surface fill, accent border on focus.
 *
 * Password fields get a reveal toggle. That toggle is for the user's own credential and is
 * unrelated to message reveal — no gesture, no timer.
 */
export const VadeField = React.forwardRef<HTMLInputElement, VadeFieldProps>(
  ({ label, helperText, error, type = 'text', id, className = '', ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    const [showPassword, setShowPassword] = useState(false);

    const isPassword = type === 'password';
    const resolvedType = isPassword && showPassword ? 'text' : type;

    return (
      <div className="w-full text-left">
        {label && (
          <label htmlFor={inputId} className="block pl-5 pb-1.5 text-[12.5px] text-muted">
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={[
              'w-full h-[52px] rounded-full bg-surface px-5 text-[15px] text-text',
              'placeholder:text-muted caret-accent',
              'border border-transparent transition-colors',
              'focus:outline-none focus:border-accent',
              'disabled:opacity-45 disabled:cursor-not-allowed',
              error ? 'border-warn' : '',
              isPassword ? 'pr-[52px]' : '',
              className,
            ].join(' ')}
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-4 p-1.5 text-muted hover:text-text rounded-full cursor-pointer focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {showPassword ? (
                <EyeOff className="w-[18px] h-[18px]" strokeWidth={2.75} aria-hidden="true" />
              ) : (
                <Eye className="w-[18px] h-[18px]" strokeWidth={2.75} aria-hidden="true" />
              )}
            </button>
          )}
        </div>

        {error ? (
          <p id={errorId} role="alert" className="flex items-center gap-1.5 pt-1.5 pl-5 text-[12.5px] text-warn">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={2.75} aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : helperText ? (
          <p id={helperId} className="pt-1.5 pl-5 text-[12.5px] leading-snug text-muted">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

VadeField.displayName = 'VadeField';
