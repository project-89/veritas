'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Label shown in the fallback, e.g. the region that failed. */
  label?: string;
  children: ReactNode;
  /** Optional custom fallback renderer. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/runtime errors in a subtree so one broken panel degrades to a
 * recoverable message instead of white-screening the whole workspace.
 */
export class NervErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced to the console for debugging; no telemetry pipeline yet.
    console.error(`[${this.props.label ?? 'workspace'}] render error:`, error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 border border-nerv-red/50 bg-nerv-red/10 text-center">
        <span className="text-[12px] font-mono uppercase tracking-widest text-nerv-red">
          {this.props.label ?? 'Panel'} failed to render
        </span>
        <span className="text-[11px] font-mono text-nerv-text-muted max-w-[420px] break-words">
          {error.message}
        </span>
        <button
          type="button"
          onClick={this.reset}
          className="px-3 py-1 text-[11px] font-mono uppercase tracking-wider border border-nerv-orange text-nerv-orange hover:bg-nerv-orange/10 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }
}
