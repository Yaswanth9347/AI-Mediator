import React from 'react';
import * as Sentry from '@sentry/react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null,
      eventId: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Capture error to Sentry and get event ID
    Sentry.withScope((scope) => {
      scope.setContext('errorBoundary', {
        componentStack: errorInfo.componentStack,
      });
      const eventId = Sentry.captureException(error);
      
      this.setState({
        error,
        errorInfo,
        eventId
      });
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleReportFeedback = () => {
    if (this.state.eventId) {
      Sentry.showReportDialog({
        eventId: this.state.eventId,
        title: 'We\'re sorry, something went wrong',
        subtitle: 'Our team has been notified. If you\'d like to help, tell us what happened below.',
        subtitle2: '',
      });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
            <div className="flex flex-col items-center text-center">
              {/* Error Icon */}
              <div className="bg-red-100 rounded-full p-4 mb-4">
                <AlertCircle className="w-12 h-12 text-red-600" />
              </div>

              {/* Error Title */}
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Oops! Something went wrong
              </h1>

              {/* Error Description */}
              <p className="text-gray-600 mb-6">
                We're sorry for the inconvenience. The error has been automatically reported to our team.
              </p>

              {/* Error Details (Only in development) */}
              {import.meta.env.MODE === 'development' && this.state.error && (
                <div className="w-full bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-left">
                  <p className="text-sm font-mono text-red-800 mb-2">
                    <strong>Error:</strong> {this.state.error.toString()}
                  </p>
                  {this.state.errorInfo && (
                    <details className="text-xs text-red-700 mt-2">
                      <summary className="cursor-pointer font-semibold">
                        Component Stack
                      </summary>
                      <pre className="mt-2 overflow-auto max-h-40">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <button
                  onClick={this.handleReload}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload Page
                </button>
                
                <button
                  onClick={this.handleGoHome}
                  className="flex-1 flex items-center justify-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Home className="w-4 h-4" />
                  Go Home
                </button>
              </div>

              {/* Report Feedback Button (if event ID exists) */}
              {this.state.eventId && (
                <button
                  onClick={this.handleReportFeedback}
                  className="mt-4 text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  Send us feedback about this error
                </button>
              )}

              {/* Additional Help */}
              <p className="mt-6 text-sm text-gray-500">
                If this problem persists, please contact support with error ID:{' '}
                <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                  {this.state.eventId || 'N/A'}
                </code>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Create a Sentry-enhanced version
const SentryErrorBoundary = Sentry.withErrorBoundary(ErrorBoundary, {
  fallback: ({ error, componentStack, resetError }) => (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="flex flex-col items-center text-center">
          <div className="bg-red-100 rounded-full p-4 mb-4">
            <AlertCircle className="w-12 h-12 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Application Error
          </h1>
          <p className="text-gray-600 mb-6">
            An unexpected error occurred. Please try reloading the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Page
          </button>
        </div>
      </div>
    </div>
  ),
  showDialog: true,
});

export default ErrorBoundary;
export { SentryErrorBoundary };
