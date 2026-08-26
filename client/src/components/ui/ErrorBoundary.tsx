import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

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
  public state: ErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    // Log sanitized error indicator without message payload
    console.error('Section ErrorBoundary caught an error:', error.name);
  }

  public handleReset = () => {
    this.setState({ hasError: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4 max-w-md mx-auto my-6"
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-950/50 border border-rose-800/60 flex items-center justify-center mx-auto text-rose-400">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-slate-100">
              {this.props.fallbackTitle || 'Unable to display this section'}
            </h3>
            <p className="text-xs text-slate-400">
              {this.props.fallbackMessage || 'An unexpected problem occurred while rendering this component.'}
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={this.handleReset}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
