import React, { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PublicBrowserCall } from './WebCall';
import './styles.css';

// Safeguard React DOM against Chrome Google Translate & browser extension DOM node mutations
if (typeof Node === 'function' && Node.prototype) {
  const origRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child && child.parentNode !== this) {
      if (child.parentNode) {
        return origRemoveChild.call(child.parentNode, child) as T;
      }
      return child;
    }
    return origRemoveChild.apply(this, arguments as any) as T;
  };

  const origInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return this.appendChild(newNode) as T;
    }
    return origInsertBefore.apply(this, arguments as any) as T;
  };
}

const Admin = React.lazy(() => import('./admin').then(({ Admin }) => ({ default: Admin })));
const isAdmin = /^\/(?:wp-admin|admin)(?:\/|$)/i.test(window.location.pathname);
const isPublicCall = /^\/call-room\/?$/i.test(window.location.pathname);

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; err: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, err };
  }
  componentDidCatch(err: any, info: any) {
    console.error('App Crash:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0e0d0c', color: '#f5f0eb', padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <h2 style={{ fontSize: 24, marginBottom: 12 }}>something went wrong</h2>
          <p style={{ color: '#9c9489', maxWidth: 460, fontSize: 14, marginBottom: 20 }}>{this.state.err?.message || 'an unexpected error occurred'}</p>
          <button onClick={() => location.reload()} style={{ padding: '10px 24px', background: '#e07a5f', color: '#fff', border: 'none', borderRadius: 99, cursor: 'pointer', fontWeight: 600 }}>reload page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isPublicCall ? <PublicBrowserCall /> : isAdmin ? (
        <React.Suspense fallback={<main role="status">Loading admin…</main>}>
          <Admin />
        </React.Suspense>
      ) : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
