import React from 'react';
import { Eye, Shapes, Sparkles } from 'lucide-react';
import { useProtectionStyle } from '../../hooks/useProtectionStyle';
import { protect, type ProtectionMode } from '../../utils/protectedText/protectedTextEngine';
import { useToast } from '../ui/Toast';

const PREVIEW_TEXT = 'See you at the station tonight';

const OPTIONS: Array<{ mode: ProtectionMode; label: string; description: string; icon: React.ReactNode }> = [
  {
    mode: 'HOMOGLYPH',
    label: 'Classic',
    description: 'Look-alike characters replace letters — the original style.',
    icon: <Eye className="w-4 h-4" aria-hidden="true" />,
  },
  {
    mode: 'ILLUSION',
    label: 'Illusion',
    description: 'A partially distorted look that stays roughly readable up close.',
    icon: <Sparkles className="w-4 h-4" aria-hidden="true" />,
  },
  {
    mode: 'PATTERN',
    label: 'Pattern',
    description: 'Shows only an abstract hint about the message, not its content.',
    icon: <Shapes className="w-4 h-4" aria-hidden="true" />,
  },
];

export const ProtectionStyleSettings: React.FC = () => {
  const { mode, setMode } = useProtectionStyle();
  const { success } = useToast();

  const handleSelect = (nextMode: ProtectionMode) => {
    if (nextMode === mode) return;
    if (setMode(nextMode)) {
      success('Protection style updated.');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
      <div>
        <h3 className="text-sm font-bold text-slate-100">Protection Style</h3>
        <p className="text-xs text-slate-400 mt-1">
          Choose how protected messages look before you reveal them. This only changes how
          messages are displayed on this device.
        </p>
      </div>

      <div role="radiogroup" aria-label="Protection Style" className="space-y-2.5">
        {OPTIONS.map((option) => {
          const isSelected = option.mode === mode;
          const preview = protect(PREVIEW_TEXT, option.mode);

          return (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelect(option.mode)}
              className={`w-full text-left p-3.5 rounded-2xl border transition-colors flex items-start gap-3 ${
                isSelected
                  ? 'bg-emerald-500/10 border-emerald-500/40'
                  : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 ${
                  isSelected
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {option.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-100">{option.label}</span>
                  {isSelected && (
                    <span className="text-[10px] uppercase font-mono text-emerald-400 font-semibold tracking-wider">
                      Selected
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{option.description}</p>
                <p className="text-xs font-mono text-slate-500 mt-1.5 truncate">{preview}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
