import React, { useMemo } from 'react';
import { protectMessage } from '../../utils/protectMessage';

export interface ProtectedMessageProps {
  content: string;
  displayMode?: 'protected' | 'revealed';
  className?: string;
}

/**
 * ProtectedMessage Component
 *
 * Renders visual shoulder-surfing protection over message content.
 * Prepared for Phase 6 reveal modes.
 */
export const ProtectedMessage: React.FC<ProtectedMessageProps> = React.memo(
  ({ content, displayMode = 'protected', className = '' }) => {
    const displayedText = useMemo(() => {
      if (displayMode === 'revealed') {
        return content;
      }
      return protectMessage(content);
    }, [content, displayMode]);

    return (
      <span
        className={`protected-message-content select-text ${className}`}
        aria-label={displayMode === 'revealed' ? undefined : 'Protected message'}
      >
        {displayedText}
      </span>
    );
  }
);

ProtectedMessage.displayName = 'ProtectedMessage';
