import { useTranslation } from 'react-i18next';
import { formatDate } from '../lib/format';

interface Props {
  online: boolean;
  pending: number;
  lastEvaluatedAt: string | null;
}

/** Shown only while offline: queued answers and the last-evaluated date of saved results. */
export function OfflineBanner({ online, pending, lastEvaluatedAt }: Props) {
  const { t, i18n } = useTranslation();
  if (online) return null;
  const date = lastEvaluatedAt ? formatDate(lastEvaluatedAt, i18n.language) : null;
  return (
    <div
      role="status"
      className="space-y-1 border-b-4 border-amber-700 bg-amber-100 px-4 py-3 text-amber-950"
    >
      <p className="font-semibold">{t('offline.banner')}</p>
      {pending > 0 && <p>{t('offline.pending', { count: pending })}</p>}
      {date && <p>{t('offline.lastEvaluated', { date })}</p>}
    </div>
  );
}
