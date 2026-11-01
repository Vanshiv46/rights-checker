import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';

const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, networkMode: 'always', refetchOnWindowFocus: false },
          mutations: { retry: false, networkMode: 'always' },
        },
      }),
  );
  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <BrowserRouter future={ROUTER_FUTURE}>{children}</BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
