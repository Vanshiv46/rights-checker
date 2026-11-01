import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { StatusPill } from '../components/StatusPill';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import { describeReason, factLabel } from '../features/results/describe';
import {
  findResult,
  groupByKind,
  schemePath,
  useExplain,
  useResults,
  useScheme,
} from '../features/results/hooks';
import { useSessionStore } from '../features/session/store';
import { formatDate } from '../lib/format';

export default function SchemeDetail() {
  const { t, i18n } = useTranslation();
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const member = params.get('m') ?? '';
  const sessionId = useSessionStore((s) => s.sessionId);
  const results = useResults(sessionId);
  const scheme = useScheme(code);
  const explain = useExplain(sessionId ?? '');

  if (results.isPending) return <Loading />;
  if (results.isError) return <ErrorState onRetry={() => void results.refetch()} />;
  const result = findResult(results.data.results, code, member);
  if (!result) {
    return (
      <div className="space-y-4">
        <EmptyState message={t('detail.notFound')} />
        <Link to="/results" className="btn-secondary">
          {t('common.back')}
        </Link>
      </div>
    );
  }

  const toVerify = [...(result.checksLeft ?? []), ...(result.missingFacts ?? [])];
  const groups = result.checklist ? groupByKind(result.checklist) : [];
  const date = (iso: string) => formatDate(iso, i18n.language);

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">{t('results.title')}</p>
        <h1 className="text-2xl font-bold">{result.scheme}</h1>
        <p className="muted">{t(`schemes.${result.scheme}`, { defaultValue: '' })}</p>
        <StatusPill verdict={result.verdict} />
        <p className="note">{t('common.disclaimer')}</p>
      </header>

      {scheme.data?.benefit && (
        <section className="card space-y-2 border-l-[6px] border-l-brand" aria-labelledby="benefit">
          <h2 id="benefit" className="text-xl font-bold">
            {t('detail.benefit')}
          </h2>
          <p>{scheme.data.benefit}</p>
        </section>
      )}
      <section className="card space-y-3" aria-labelledby="why">
        <h2 id="why" className="text-xl font-bold">
          {t('detail.why')}
        </h2>
        <ul className="list-disc space-y-1 pl-6">
          {result.reasons.map((r) => (
            <li key={r}>{describeReason(t, r)}</li>
          ))}
        </ul>
        <button
          type="button"
          className="btn-secondary"
          disabled={explain.isPending}
          onClick={() => explain.mutate({ scheme: result.scheme, member: result.member })}
        >
          {explain.isPending ? t('detail.explaining') : t('detail.explain')}
        </button>
        {explain.isSuccess && (
          <div className="space-y-1">
            <p className="whitespace-pre-line">{explain.data.data.text}</p>
            {explain.data.data.citation && (
              <p className="text-sm muted">
                {t('detail.source')}: {explain.data.data.citation}
              </p>
            )}
          </div>
        )}
        {explain.isError && <p role="alert">{t('detail.explainError')}</p>}
      </section>

      <section className="card space-y-2" aria-labelledby="verify">
        <h2 id="verify" className="text-xl font-bold">
          {t('detail.toVerify')}
        </h2>
        {toVerify.length === 0 ? (
          <p>{t('detail.nothingToVerify')}</p>
        ) : (
          <ul className="list-disc space-y-1 pl-6">
            {toVerify.map((key) => (
              <li key={key}>{factLabel(t, key)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3" aria-labelledby="docs">
        <h2 id="docs" className="text-xl font-bold">
          {t('detail.documents')}
        </h2>
        {result.checklist === null ? (
          <p>{t('detail.pendingState')}</p>
        ) : (
          groups.map((g) => (
            <div key={g.kind}>
              <h3 className="font-bold">{t(`kind.${g.kind}`)}</h3>
              <ul className="list-disc pl-6">
                {g.docs.map((d) => (
                  <li key={d.document}>
                    {t(`documents.${d.document}`, { defaultValue: d.document })}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        {result.checklist && (
          <Link to={schemePath(result, 'checklist')} className="btn-primary">
            {t('detail.checklist')}
          </Link>
        )}
      </section>

      {result.source && (
        <section className="card space-y-1" aria-labelledby="source">
          <h2 id="source" className="text-xl font-bold">
            {t('detail.source')}
          </h2>
          <p>
            {result.source.title}
            {result.source.section &&
              `, ${t('detail.section', { section: result.source.section })}`}
          </p>
          {result.verifiedOn && <p>{t('detail.verifiedOn', { date: date(result.verifiedOn) })}</p>}
          {result.ruleVersion && <p>{t('detail.ruleVersion', { version: result.ruleVersion })}</p>}
        </section>
      )}

      {result.nextStep && (
        <section className="card space-y-3" aria-labelledby="next">
          <h2 id="next" className="text-xl font-bold">
            {t('detail.nextStep')}
          </h2>
          <p>{result.nextStep.label}</p>
          <a
            className="btn-primary"
            href={result.nextStep.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('detail.officialLink')}
          </a>
          <p>{t('detail.offlineRoute', { route: result.nextStep.offline })}</p>
        </section>
      )}

      <Link to="/results" className="btn-secondary">
        {t('common.back')}
      </Link>
    </article>
  );
}
