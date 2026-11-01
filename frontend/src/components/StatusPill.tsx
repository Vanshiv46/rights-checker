import { useTranslation } from 'react-i18next';
import type { Verdict } from '../lib/types';

const STYLES: Record<Verdict, { classes: string; icon: string }> = {
  LIKELY: { classes: 'border-green-800 bg-green-50 text-green-900', icon: '✓' },
  NEEDS_VERIFICATION: { classes: 'border-amber-700 bg-amber-50 text-amber-950', icon: '?' },
  NOT_ELIGIBLE: { classes: 'border-slate-500 bg-slate-100 text-slate-800', icon: '✕' },
};

/** Verdict badge. Always carries the word, never colour alone. */
export function StatusPill({ verdict }: { verdict: Verdict }) {
  const { t } = useTranslation();
  const { classes, icon } = STYLES[verdict];
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 px-3 text-base font-bold ${classes}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{t(`status.${verdict}`)}</span>
    </span>
  );
}
