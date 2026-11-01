import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { Providers } from './app/Providers';
import { registerServiceWorker } from './app/registerSW';
import { hydrateDraft } from './features/session/store';
import './i18n';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

void hydrateDraft()
  .catch(() => undefined)
  .finally(() => {
    createRoot(container).render(
      <StrictMode>
        <Providers>
          <App />
        </Providers>
      </StrictMode>,
    );
  });

registerServiceWorker();
