import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { factLabel, reasonLine } from '../features/results/describe';
import { schemePath } from '../features/results/hooks';
import type { SchemeResult, Verdict } from '../lib/types';
import { StatusPill } from './StatusPill';

/** Left accent per verdict; the StatusPill always carries the word as well. */
const ACCENT: Record<Verdict, string> = {
  LIKELY: 'border-l-green-700',
  NEEDS_VERIFICATION: 'border-l-amber-600',
  NOT_ELIGIBLE: 'border-l-slate-400',
};

export function SchemeCard({ result }: { result: SchemeResult }) {
  const { t } = useTranslation();
  const relation = result.member
    ? t(`relations.${result.member}`, { defaultValue: result.member })
    : null;
  const description = t(`schemes.${result.scheme}`, { defaultValue: '' });
  const checksLeft =
    result.verdict === 'LIKELY' && result.checksLeft?.length
      ? t('card.checksLeft', { facts: result.checksLeft.map((k) => factLabel(t, k)).join(', ') })
      : null;
  const muted = result.verdict === 'NOT_ELIGIBLE';

  return (
    <article className={`card space-y-3 border-l-[6px] ${ACCENT[result.verdict]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{result.scheme}</h2>
          {description && <p className="muted">{description}</p>}
        </div>
        <StatusPill verdict={result.verdict} />
      </div>
      <p className="text-sm font-semibold muted">
        {relation ? t('card.forMember', { relation }) : t('card.forHousehold')}
      </p>
      <p className={muted ? 'muted' : 'font-semibold'}>{reasonLine(t, result)}</p>
      {checksLeft && <p className="text-sm muted">{checksLeft}</p>}
      <Link
        className={muted ? 'link inline-flex min-h-12 items-center' : 'btn-secondary'}
        to={schemePath(result)}
        aria-label={`${t('results.details')}: ${result.scheme}`}
      >
        {t('results.details')}
      </Link>
    </article>
  );
}
