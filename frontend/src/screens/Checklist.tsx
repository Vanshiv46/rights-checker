import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChecklistItem } from '../components/ChecklistItem';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import { findResult, groupByKind, useChecklistTicks, useResults } from '../features/results/hooks';
import { useSessionStore } from '../features/session/store';

export default function Checklist() {
  const { t } = useTranslation();
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const member = params.get('m') ?? '';
  const sessionId = useSessionStore((s) => s.sessionId) ?? '';
  const results = useResults(sessionId);
  const { ticked, toggle } = useChecklistTicks(sessionId, code, member);

  if (results.isPending) return <Loading />;
  if (results.isError) return <ErrorState onRetry={() => void results.refetch()} />;
  const docs = findResult(results.data.results, code, member)?.checklist ?? [];

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">{t('checklist.title', { scheme: code })}</h1>
      {docs.length === 0 ? (
        <EmptyState message={t('checklist.empty')} />
      ) : (
        <>
          <div className="card space-y-2">
            <p role="status" className="font-semibold">
              {t('checklist.progress', { done: ticked.length, total: docs.length })}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div
                className="h-full rounded-full bg-brand transition-[width]"
                style={{ width: `${(ticked.length / docs.length) * 100}%` }}
              />
            </div>
          </div>
          {groupByKind(docs).map((group) => (
            <div key={group.kind} className="space-y-2">
              <h2 className="text-xl font-bold">{t(`kind.${group.kind}`)}</h2>
              {group.docs.map((d) => (
                <ChecklistItem
                  key={d.document}
                  document={d.document}
                  checked={ticked.includes(d.document)}
                  onChange={() => void toggle(d.document)}
                />
              ))}
            </div>
          ))}
        </>
      )}
      <Link to="/results" className="btn-secondary">
        {t('common.back')}
      </Link>
    </section>
  );
}
