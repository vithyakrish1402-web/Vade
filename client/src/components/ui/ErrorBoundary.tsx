import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { VadeButton } from '../vade/VadeButton';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    // Only the error's name is logged. A message or stack from a render that was holding
    // decrypted content could carry that content into the console.
    console.error('Section ErrorBoundary caught an error:', error.name);
  }

  public handleReset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  public render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        className="mx-auto my-6 flex max-w-sm flex-col items-center gap-3.5 rounded-card bg-surface p-6 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warn-tint text-warn">
          <AlertTriangle width={22} height={22} strokeWidth={2.75} aria-hidden="true" />
        </div>

        <div>
          <h3 className="text-[15px] font-bold tracking-[-0.012em]">
            {this.props.fallbackTitle ?? 'Unable to display this section'}
          </h3>
          <p className="mt-1.5 text-row leading-normal text-muted">
            {this.props.fallbackMessage ?? 'Something went wrong while rendering this screen.'}
          </p>
        </div>

        <VadeButton variant="outline" size="sm" onClick={this.handleReset}>
          Try again
        </VadeButton>
      </div>
    );
  }
}
