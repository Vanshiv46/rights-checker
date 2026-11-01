import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ErrorState, Loading } from '../components/StateViews';
import { useCreateSession } from '../features/session/hooks';

const POINTS = ['consent.point1', 'consent.point2', 'consent.point3'] as const;

export default function Consent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateSession();
  const [declined, setDeclined] = useState(false);

  if (declined) {
    return (
      <section className="card space-y-4">
        <p className="text-xl">{t('consent.declined')}</p>
        <button type="button" className="btn-secondary" onClick={() => navigate('/')}>
          {t('common.back')}
        </button>
      </section>
    );
  }

  if (create.isPending) return <Loading />;

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">{t('consent.title')}</h1>
      <p className="text-lg">{t('consent.intro')}</p>
      <div className="card space-y-3">
        <h2 className="text-lg font-bold">{t('consent.whatTitle')}</h2>
        <ul className="space-y-3">
          {POINTS.map((key) => (
            <li key={key} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-tint font-bold text-brand-deep"
              >
                ✓
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>
      {create.isError && <ErrorState onRetry={() => create.reset()} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => create.mutate(undefined, { onSuccess: () => navigate('/household') })}
        >
          {t('consent.agree')}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setDeclined(true)}>
          {t('consent.exit')}
        </button>
      </div>
    </section>
  );
}
