import React, { useState } from 'react';
import { useGesture } from '../../hooks/useGesture';
import { GestureSequenceSetup } from './GestureSequenceSetup';
import { Shield, ShieldCheck, Sparkles, Trash2, KeyRound } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

export const GestureSettings: React.FC = () => {
  const { isConfigured, sequenceLength, deleteSequence } = useGesture();
  const { success } = useToast();
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    deleteSequence();
    setShowDeleteConfirm(false);
    success('Gesture sequence deleted.');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0 ${
              isConfigured
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {isConfigured ? (
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Shield className="w-5 h-5" aria-hidden="true" />
            )}
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
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
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
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          <span>Local Device Privacy</span>
        </div>
        <p>
          Your gesture sequence is stored <strong>locally in your browser</strong> and is never sent to the server. Protected messages will remain protected until authorized with your custom gesture.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsSetupOpen(true)}
          leftIcon={<KeyRound className="w-4 h-4" />}
        >
          {isConfigured ? 'Change Gesture Sequence' : 'Create Gesture Sequence'}
        </Button>

        {isConfigured && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-rose-400 hover:text-rose-300 hover:border-rose-800/50"
            leftIcon={<Trash2 className="w-4 h-4" />}
          >
            Delete Gesture
          </Button>
        )}
      </div>

      {/* Accessible Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Reveal Gesture?"
        description="Deleting your reveal gesture means protected messages cannot be temporarily revealed on this device until a new gesture sequence is created."
        maxWidth="sm"
      >
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Setup Wizard Modal */}
      <GestureSequenceSetup
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
      />
    </div>
  );
};
