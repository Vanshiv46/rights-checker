import { registerSW } from 'virtual:pwa-register';

/** Registers the Workbox service worker in production builds only. */
export function registerServiceWorker(): void {
  if (import.meta.env.PROD) registerSW({ immediate: true });
}
