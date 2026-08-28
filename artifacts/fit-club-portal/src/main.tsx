import { Component, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import App from './App';

import './index.css';

function dismissPreReactFallback() {
  window.dispatchEvent(new Event("fitclub:portal-mounted"));
}

function PortalFailureState() {
  useEffect(() => {
    dismissPreReactFallback();
  }, []);

  return (
    <main className="portal-pre-react-shell portal-error-state" role="alert">
      <section className="portal-pre-react-card">
        <img className="portal-pre-react-logo" src="fitclub-logo.png" alt="Fit Club" />
        <h1>We couldn’t open your invitation</h1>
        <p>
          Try opening the invitation in normal Safari instead of Private Browsing
          or an in-app browser. If it still does not open, request a fresh
          invitation from Fit Club.
        </p>
        <button
          className="portal-pre-react-retry"
          type="button"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </section>
    </main>
  );
}

type PortalErrorBoundaryProps = {
  children: ReactNode;
};

type PortalErrorBoundaryState = {
  hasError: boolean;
};

class PortalErrorBoundary extends Component<
  PortalErrorBoundaryProps,
  PortalErrorBoundaryState
> {
  state: PortalErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PortalErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return <PortalFailureState />;
    return this.props.children;
  }
}

function PortalStartup() {
  useEffect(() => {
    dismissPreReactFallback();
  }, []);

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <PortalErrorBoundary>
    <PortalStartup />
  </PortalErrorBoundary>,
);
