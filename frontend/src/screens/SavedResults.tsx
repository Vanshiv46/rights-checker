import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorState, Loading } from '../components/StateViews';
import { useResults } from '../features/results/hooks';
import { useDeleteSession } from '../features/session/hooks';
import { useSessionStore } from '../features/session/store';
import { formatDate } from '../lib/format';

export default function SavedResults() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const sessionId = useSessionStore((s) => s.sessionId);
  const lastEvaluatedAt = useSessionStore((s) => s.lastEvaluatedAt);
  const setNeedsEvaluation = useSessionStore((s) => s.setNeedsEvaluation);
  const resumeSession = useSessionStore((s) => s.resumeSession);
  const results = useResults(sessionId);
  const erase = useDeleteSession();
  const [code, setCode] = useState('');

  const recheck = () => {
    setNeedsEvaluation(true);
    void results.refetch();
  };
  const load = () => {
    // Backend codes are lowercase UUIDs; mock codes look like RE-ABC123.
    const raw = code.trim();
    const trimmed = /^re-/i.test(raw) ? raw.toUpperCase() : raw.toLowerCase();
    if (!trimmed) return;
    resumeSession(trimmed);
    navigate('/results');
  };

  if (erase.isSuccess) return <p className="card text-xl">{t('saved.erased')}</p>;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">{t('saved.title')}</h1>

      {sessionId && (
        <div className="card space-y-3">
          <p className="font-semibold">{t('saved.code')}</p>
          <p
            className="break-all rounded-lg bg-paper px-3 py-2 font-mono text-lg font-bold tracking-wide"
            aria-label={sessionId.split('').join(' ')}
          >
            {sessionId}
          </p>
          <p className="muted">{t('saved.codeHelp')}</p>
          <p>
            {lastEvaluatedAt
              ? t('saved.lastEvaluated', { date: formatDate(lastEvaluatedAt, i18n.language) })
              : t('saved.never')}
          </p>
          <p className="text-sm muted">{t('saved.recheckHelp')}</p>
          {results.isFetching && <Loading />}
          {results.isError && <ErrorState onRetry={recheck} />}
          <div className="grid gap-3">
            <Link to="/results" className="btn-primary">
              {t('saved.view')}
            </Link>
            <button type="button" className="btn-secondary" onClick={recheck}>
              {t('saved.recheck')}
            </button>
          </div>
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="text-xl font-bold">{t('saved.loadTitle')}</h2>
        <label htmlFor="code" className="label">
          {t('saved.codeLabel')}
        </label>
        <input
          id="code"
          className="field font-mono"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="button" className="btn-secondary w-full" onClick={load}>
          {t('saved.load')}
        </button>
      </div>

      {sessionId && (
        <div className="space-y-3">
          {erase.isError && <p role="alert">{t('saved.eraseError')}</p>}
          <button
            type="button"
            className="btn-danger w-full"
            disabled={erase.isPending}
            onClick={() => erase.mutate(sessionId)}
          >
            {t('saved.erase')}
          </button>
        </div>
      )}
    </section>
  );
}
