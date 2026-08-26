import React, { useState } from 'react';
import { useGesture } from '../../hooks/useGesture';
import { GestureSequenceSetup } from './GestureSequenceSetup';
import { Shield, ShieldCheck, Sparkles, Trash2, KeyRound } from 'lucide-react';

export const GestureSettings: React.FC = () => {
  const { isConfigured, sequenceLength, deleteSequence } = useGesture();
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    deleteSequence();
    setShowDeleteConfirm(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
            isConfigured
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
            {isConfigured ? <ShieldCheck className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Message Reveal Gesture</h3>
            <p className="text-xs text-slate-400">
              Custom gesture sequence to unlock protected messages on this device
            </p>
          </div>
        </div>

        <div className="shrink-0">
          {isConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Configured ({sequenceLength} steps)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
              Not Configured
            </span>
          )}
        </div>
      </div>

      <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl space-y-2 text-xs text-slate-400 leading-relaxed">
        <div className="flex items-center gap-2 text-slate-300 font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Local Device Privacy</span>
        </div>
        <p>
          Your gesture sequence is stored <strong>locally in your browser</strong> and is never sent to the server. Protected messages will remain protected until authorized with your custom gesture.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => setIsSetupOpen(true)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow flex items-center gap-2"
        >
          <KeyRound className="w-4 h-4" />
          <span>{isConfigured ? 'Change Gesture Sequence' : 'Create Gesture Sequence'}</span>
        </button>

        {isConfigured && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2.5 bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 text-xs font-semibold rounded-xl transition-colors border border-slate-700 hover:border-rose-800/50 cursor-pointer flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Gesture</span>
          </button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <h4 className="text-base font-bold text-slate-100">Delete Reveal Gesture?</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Deleting your reveal gesture means protected messages cannot be temporarily revealed on this device until a new gesture sequence is created.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors border border-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer shadow"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Wizard Modal */}
      <GestureSequenceSetup
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
      />
    </div>
  );
};
