import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-full bg-surface-900 text-white p-8 gap-4">
          <AlertTriangle className="w-12 h-12 text-yellow-400" />
          <h3 className="text-lg font-semibold">เกิดข้อผิดพลาดในโปรแกรม</h3>
          <p className="text-sm text-zinc-400 max-w-md text-center">{this.state.error?.message}</p>
          <div className="flex gap-3">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              รีโหลดส่วนนี้
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 bg-surface-700 hover:bg-surface-600 rounded-lg text-sm transition-colors"
            >
              รีโหลดทั้งหน้า
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
