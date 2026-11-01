import { useTranslation } from 'react-i18next';

export function Loading() {
  const { t } = useTranslation();
  return (
    <p role="status" className="py-8 text-center text-lg">
      {t('common.loading')}
    </p>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="card space-y-3 border-red-800">
      <p className="font-semibold text-red-900">{t('common.error')}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="card text-center muted">{message}</p>;
}
