import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router-dom';
import { OfflineBanner } from '../components/OfflineBanner';
import { Loading } from '../components/StateViews';
import { useOperatorLogout } from '../features/session/hooks';
import { useSessionStore } from '../features/session/store';
import { useOfflineQueue } from '../features/session/useOfflineQueue';

const NAV_LINK =
  'inline-flex min-h-12 items-center rounded px-1 font-semibold text-white underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-saffron';

export function Layout() {
  const { t } = useTranslation();
  const { online, pending } = useOfflineQueue();
  const operator = useSessionStore((s) => s.operator);
  const lastEvaluatedAt = useSessionStore((s) => s.lastEvaluatedAt);
  const logout = useOperatorLogout();

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-white focus:p-3 focus:text-ink"
      >
        {t('common.skip')}
      </a>
      <header className="border-t-4 border-saffron bg-brand-deep text-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 px-4 py-1">
          <Link
            to="/"
            className="inline-flex min-h-12 items-center gap-2 rounded text-lg font-bold focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-saffron"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-8 items-center justify-center rounded-full bg-white text-base text-brand-deep"
            >
              ✓
            </span>
            {t('app.title')}
          </Link>
          <nav className="flex flex-wrap gap-x-4" aria-label="Main">
            <Link to="/saved" className={NAV_LINK}>
              {t('nav.saved')}
            </Link>
            {operator ? (
              <>
                {operator.role === 'admin' && (
                  <Link to="/admin" className={NAV_LINK}>
                    {t('nav.admin')}
                  </Link>
                )}
                <button type="button" className={NAV_LINK} onClick={logout}>
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <Link to="/operator" className={NAV_LINK}>
                {t('nav.operator')}
              </Link>
            )}
          </nav>
        </div>
        {operator && (
          <p className="bg-ink px-4 py-1 text-center text-sm font-semibold">
            {t('nav.assisting', { cscId: operator.cscId })}
          </p>
        )}
      </header>
      <OfflineBanner online={online} pending={pending} lastEvaluatedAt={lastEvaluatedAt} />
      <main
        id="main"
        className={`mx-auto px-4 py-6 sm:py-8 ${operator ? 'max-w-3xl' : 'max-w-xl'}`}
      >
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="mx-auto max-w-xl border-t border-line px-4 py-6 text-sm text-ink-soft">
        {t('common.disclaimer')}
      </footer>
    </div>
  );
}
