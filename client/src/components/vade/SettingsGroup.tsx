import React from 'react';
import { ChevronRight } from 'lucide-react';

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

/** The 11px uppercase label that heads each settings group and list section. */
export const SectionLabel: React.FC<SectionLabelProps> = ({ children, className = '' }) => (
  <div className={`pb-2 pl-0.5 text-label uppercase text-faint ${className}`}>{children}</div>
);

interface SettingsGroupProps {
  label?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** A 20px-radius surface holding hairline-divided rows. */
export const SettingsGroup: React.FC<SettingsGroupProps> = ({ label, children, className = '' }) => (
  <div className={className}>
    {label && <SectionLabel>{label}</SectionLabel>}
    <div className="overflow-hidden rounded-card bg-surface [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-line">
      {children}
    </div>
  </div>
);

interface SettingsRowProps {
  label: string;
  /** Shown right-aligned before the chevron. */
  value?: React.ReactNode;
  onClick?: () => void;
  /** Draws the chevron. Defaults to true when the row is interactive. */
  chevron?: boolean;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({ label, value, onClick, chevron }) => {
  const showChevron = chevron ?? Boolean(onClick);

  const content = (
    <>
      <span className="flex-1 text-left text-[15px]">{label}</span>
      {value != null && <span className="text-sm text-muted">{value}</span>}
      {showChevron && (
        <ChevronRight
          className="shrink-0 text-faint"
          width={17}
          height={17}
          strokeWidth={2.75}
          aria-hidden="true"
        />
      )}
    </>
  );

  // 48px minimum target, matching the Android parity rule.
  const shared = 'flex w-full min-h-12 items-center gap-3 px-4 py-3.5';

  if (!onClick) {
    return <div className={shared}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${shared} cursor-pointer text-left focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`}
    >
      {content}
    </button>
  );
};
