import React, { createContext, useContext } from 'react';
import { useConversations } from './useConversations';
import { useAuth } from '../auth/AuthContext';

type ConversationsValue = ReturnType<typeof useConversations>;

const ConversationsContext = createContext<ConversationsValue | null>(null);

/**
 * One conversation list for the whole signed-in shell.
 *
 * The desktop layout shows the list beside every screen while the mobile layout shows it on
 * its own route; sharing a single hook instance keeps them from fetching — and reordering on
 * incoming messages — independently.
 */
export const ConversationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const value = useConversations(user?.id);
  return <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>;
};

export function useConversationsContext(): ConversationsValue {
  const context = useContext(ConversationsContext);
  if (!context) throw new Error('useConversationsContext must be used within a ConversationsProvider');
  return context;
}

