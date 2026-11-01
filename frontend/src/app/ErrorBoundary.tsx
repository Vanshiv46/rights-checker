import { Component, type ReactNode } from 'react';
import i18n from '../i18n';

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-2xl font-bold">{i18n.t('errorBoundary.title')}</h1>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          {i18n.t('errorBoundary.reload')}
        </button>
      </div>
    );
  }
}
