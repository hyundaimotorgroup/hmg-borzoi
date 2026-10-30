"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((error: Error) => React.ReactNode);
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return typeof this.props.fallback === "function"
          ? this.props.fallback(this.state.error)
          : this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800">
          <AlertCircle className="w-8 h-8 text-red-500 mb-3" />
          <p className="text-sm text-red-800 dark:text-red-300 mb-1">
            Failed to load this section
          </p>
          <p className="text-xs text-red-600 dark:text-red-400 mb-4 max-w-sm">
            {this.state.error.message}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={this.handleReset}
            className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
