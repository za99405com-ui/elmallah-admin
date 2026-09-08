import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#0f172a', color: '#f43f5e', fontFamily: 'monospace', minHeight: '100vh', direction: 'ltr' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>⚠️ React Runtime Error Captured:</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#020617', padding: '15px', borderRadius: '8px', color: '#fbbf24' }}>
            {this.state.error?.toString()}
          </pre>
          <p style={{ color: '#94a3b8', marginTop: '10px', fontSize: '14px' }}>Stack details:</p>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#020617', padding: '15px', borderRadius: '8px', color: '#cbd5e1', fontSize: '11px' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
