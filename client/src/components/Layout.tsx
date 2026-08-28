import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ToastProvider } from './ui/Toast';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { checkBrowserCapabilities } from '../utils/browserCapabilities';

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * The outermost frame.
 *
 * There is no persistent top chrome: navigation lives in the bottom bar on mobile and the icon
 * rail on desktop, and every screen owns its own header. The only thing that can appear above
 * the app is the capability warning — if the browser cannot do the crypto, nothing below it is
 * trustworthy.
 */
export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const capabilities = useMemo(() => checkBrowserCapabilities(), []);

  return (
    <ToastProvider>
      <div className="flex min-h-[100dvh] flex-col bg-bg text-text">
        {!capabilities.isSupported && (
          <div
            role="alert"
            className="flex items-center justify-center gap-2 border-b border-warn bg-warn-tint px-4 py-3 text-[12.5px] text-warn"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.75} aria-hidden="true" />
            <span>
              <strong>Unsupported browser:</strong> {capabilities.errorMessage}
            </span>
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col">
          <ErrorBoundary
            fallbackTitle="Something went wrong"
            fallbackMessage="This screen could not be displayed."
          >
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </ToastProvider>
  );
};
