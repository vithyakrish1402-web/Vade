import React, { useId } from 'react';
import { useOverlay } from './useOverlay';

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Small line above the content — used for "Message actions". */
  kicker?: string;
  description?: string;
  /** Rendered under the rows, e.g. the note about copy and forward. */
  footnote?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The bottom sheet: full width, 30px top corners, grab handle, dismissed by backdrop tap.
 * Used by the protection style picker and the message action list.
 */
export const ActionSheet: React.FC<ActionSheetProps> = ({
  isOpen,
  onClose,
  title,
  kicker,
  description,
  footnote,
  children,
}) => {
  const containerRef = useOverlay(isOpen, onClose);
  const titleId = useId();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-scrim animate-fade"
      onClick={onClose}
      data-testid="action-sheet-backdrop"
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : (kicker ?? 'Actions')}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-sheet bg-bg px-[22px] pt-[22px] pb-[30px] animate-sheet focus:outline-none"
      >
        <div className="mx-auto mb-[18px] h-1 w-[38px] rounded-full bg-line" aria-hidden="true" />

        {kicker && <div className="pb-3 pl-0.5 text-xs text-faint">{kicker}</div>}

        {title && (
          <h2 id={titleId} className="mb-1 text-sheet font-bold">
            {title}
          </h2>
        )}

        {description && <p className="mb-[18px] text-row leading-relaxed text-muted">{description}</p>}

        {children}

        {footnote && (
          <div className="flex items-start gap-1.5 pt-3.5 text-meta leading-snug text-faint">{footnote}</div>
        )}
      </div>
    </div>
  );
};

interface ActionSheetRowProps {
  icon?: React.ReactNode;
  label: string;
  note?: string;
  onClick: () => void;
  /** Destructive rows take the ochre ink. */
  tone?: 'default' | 'warn';
}

export const ActionSheetRow: React.FC<ActionSheetRowProps> = ({
  icon,
  label,
  note,
  onClick,
  tone = 'default',
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-3.5 border-b border-line px-1 py-[15px] text-left cursor-pointer focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
      tone === 'warn' ? 'text-warn' : 'text-text'
    }`}
  >
    {icon && <span className="flex w-[22px] shrink-0 items-center justify-center">{icon}</span>}
    <span className="min-w-0 flex-1">
      <span className="block text-name font-bold">{label}</span>
      {note && <span className="mt-px block text-[12.5px] leading-snug text-muted">{note}</span>}
    </span>
  </button>
);
