import React, { useMemo } from 'react';
import { protect, type ProtectionMode } from '../../utils/protectedText/protectedTextEngine';

export interface ProtectedMessageProps {
  content: string;
  displayMode?: 'protected' | 'revealed';
  mode?: ProtectionMode;
  className?: string;
}

/**
 * ProtectedMessage Component
 *
 * Renders visual shoulder-surfing protection over message content using the selected
 * Protected Text v2 rendering strategy (Classic/Illusion/Pattern). Gated by gesture-authorized
 * reveal — `displayMode` is controlled entirely by the caller's reveal state.
 *
 * Fail-closed: if the renderer throws for any reason, a safe warning is shown instead of ever
 * falling back to plaintext.
 */
export const ProtectedMessage: React.FC<ProtectedMessageProps> = React.memo(
  ({ content, displayMode = 'protected', mode = 'HOMOGLYPH', className = '' }) => {
    const protectedText = useMemo(() => {
      if (displayMode === 'revealed') return content;
      try {
        return protect(content, mode);
      } catch (error) {
        console.error('Protected text rendering failed:', error);
        return null;
      }
    }, [content, displayMode, mode]);

    if (protectedText === null) {
      return (
        <span
          className={`protected-message-error select-text ${className}`}
          role="alert"
          aria-label="Unable to display protected message"
        >
          ⚠️ Unable to display protected message
        </span>
      );
    }

    return (
      <span
        className={`protected-message-content select-text ${className}`}
        aria-label={displayMode === 'revealed' ? undefined : protectedText}
      >
        {protectedText}
      </span>
    );
  }
);

ProtectedMessage.displayName = 'ProtectedMessage';
