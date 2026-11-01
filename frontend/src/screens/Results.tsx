import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SchemeCard } from '../components/SchemeCard';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import { useResults } from '../features/results/hooks';
import { useSessionStore } from '../features/session/store';
import type { SchemeResult, Verdict } from '../lib/types';

const ORDER: Verdict[] = ['LIKELY', 'NEEDS_VERIFICATION', 'NOT_ELIGIBLE'];
const byVerdict = (a: SchemeResult, b: SchemeResult) =>
  ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict);
const count = (results: SchemeResult[], verdict: Verdict) =>
  results.filter((r) => r.verdict === verdict).length;

export default function Results() {
  const { t } = useTranslation();
  const sessionId = useSessionStore((s) => s.sessionId);
  const operator = useSessionStore((s) => s.operator);
  const query = useResults(sessionId);

  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('results.title')}</h1>
        <p className="muted">{t('results.intro')}</p>
        {query.data.results.length > 0 && (
          <p className="font-semibold">
            {t('results.summary', {
              likely: count(query.data.results, 'LIKELY'),
              needs: count(query.data.results, 'NEEDS_VERIFICATION'),
              not: count(query.data.results, 'NOT_ELIGIBLE'),
            })}
          </p>
        )}
      </div>
      <p className="note">{t('common.disclaimer')}</p>
      {query.data.results.length === 0 ? (
        <EmptyState message={t('results.empty')} />
      ) : (
        <ul className="space-y-3">
          {[...query.data.results].sort(byVerdict).map((r) => (
            <li key={`${r.scheme}:${r.member ?? ''}`}>
              <SchemeCard result={r} />
            </li>
          ))}
        </ul>
      )}
      <div className="no-print grid gap-3">
        <Link to="/saved" className="btn-primary">
          {t('nav.saved')}
        </Link>
        {operator && (
          <button type="button" className="btn-secondary" onClick={() => window.print()}>
            {t('common.print')}
          </button>
        )}
      </div>
    </section>
  );
}
