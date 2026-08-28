import React, { useMemo } from 'react';
import { protect, type ProtectionMode } from '../../utils/protectedText/protectedTextEngine';

/**
 * `HOMOGLYPH` is presented as "Classic" — the engine name is kept internally so existing stored
 * preferences and test vectors stay valid.
 */
export const STYLE_META: Record<'HOMOGLYPH' | 'ILLUSION' | 'PATTERN', { label: string; description: string }> =
  {
    HOMOGLYPH: {
      label: 'Classic',
      description: 'Look-alike letterforms keep the shape of the sentence.',
    },
    ILLUSION: {
      label: 'Illusion',
      description: 'Reads as an ordinary, unrelated message.',
    },
    PATTERN: {
      label: 'Pattern',
      description: 'No letterforms — rhythm and an intent marker only.',
    },
  };

export const SELECTABLE_STYLES = ['HOMOGLYPH', 'ILLUSION', 'PATTERN'] as const;

/** A fixed, local sample. Never a real message — the picker must not leak thread content. */
const PREVIEW_SAMPLE = 'See you at the station tonight';

export function styleLabel(mode: ProtectionMode): string {
  return STYLE_META[mode as keyof typeof STYLE_META]?.label ?? 'Classic';
}

interface ProtectionStylePickerProps {
  value: ProtectionMode;
  onChange: (next: ProtectionMode) => void;
}

/**
 * The three rendering styles, each with a live preview of the same sample sentence.
 *
 * This is a local rendering preference only. It changes nothing about encryption and is never
 * transmitted — the copy above the picker says so, because a privacy control that looks like a
 * security control is worse than no control.
 */
export const ProtectionStylePicker: React.FC<ProtectionStylePickerProps> = ({ value, onChange }) => {
  const previews = useMemo(
    () =>
      SELECTABLE_STYLES.reduce<Record<string, string>>((accumulator, mode) => {
        try {
          accumulator[mode] = protect(PREVIEW_SAMPLE, mode);
        } catch {
          accumulator[mode] = '';
        }
        return accumulator;
      }, {}),
    []
  );

  return (
    <div role="radiogroup" aria-label="Protection style" className="flex flex-col gap-stack">
      {SELECTABLE_STYLES.map((mode) => {
        const selected = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(mode)}
            className={`flex cursor-pointer items-start gap-3 rounded-card border-[1.5px] bg-surface p-[14px_15px] text-left focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              selected ? 'border-accent' : 'border-transparent'
            }`}
          >
            <span
              className={`mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] ${
                selected ? 'border-accent bg-accent shadow-[inset_0_0_0_3.5px_var(--v-surface)]' : 'border-faint'
              }`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold tracking-[-0.012em]">
                {STYLE_META[mode].label}
              </span>
              <span className="mt-px block text-[12.5px] leading-snug text-muted">
                {STYLE_META[mode].description}
              </span>
              <span className="mt-2 block text-[13.5px] tracking-[0.02em] opacity-85" aria-hidden="true">
                {previews[mode]}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
