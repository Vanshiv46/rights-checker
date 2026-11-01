import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, Loading } from '../components/StateViews';
import { useSchemes, useVerificationQueue } from '../features/results/hooks';
import { useSessionStore } from '../features/session/store';

export default function AdminRules() {
  const { t } = useTranslation();
  const operator = useSessionStore((s) => s.operator);
  const isAdmin = operator?.role === 'admin';
  const schemes = useSchemes();
  const queue = useVerificationQueue();

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <EmptyState message={t('admin.forbidden')} />
        <Link to="/operator" className="btn-primary">
          {t('operator.login')}
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">{t('admin.title')}</h1>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">{t('admin.schemes')}</h2>
        {schemes.isPending && <Loading />}
        {schemes.isError && <ErrorState onRetry={() => void schemes.refetch()} />}
        {schemes.isSuccess && schemes.data.length === 0 && (
          <EmptyState message={t('common.none')} />
        )}
        {schemes.isSuccess && schemes.data.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full border-collapse bg-white text-left text-base">
              <thead>
                <tr className="border-b-2 border-ink/20 bg-paper text-sm uppercase tracking-wide">
                  <th className="p-2">{t('results.title')}</th>
                  <th className="p-2">{t('admin.version')}</th>
                  <th className="p-2">{t('admin.status')}</th>
                  <th className="p-2">{t('admin.verifiedOn')}</th>
                </tr>
              </thead>
              <tbody>
                {schemes.data.map((s) => (
                  <tr key={s.code} className="border-b border-line">
                    <th scope="row" className="p-2">
                      {s.code}
                    </th>
                    <td className="p-2">{s.currentVersion ?? t('admin.none')}</td>
                    <td className="p-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-sm font-semibold ${s.status === 'published' ? 'border-green-800 bg-green-50 text-green-900' : 'border-amber-700 bg-amber-50 text-amber-950'}`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="p-2">{s.verifiedOn ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">{t('admin.queue')}</h2>
        {queue.isPending && <Loading />}
        {queue.isError && <ErrorState onRetry={() => void queue.refetch()} />}
        {queue.isSuccess && queue.data.length === 0 && <EmptyState message={t('admin.noQueue')} />}
        {queue.isSuccess && (
          <ul className="space-y-2">
            {queue.data.map((item) => (
              <li key={item.version} className="card border-l-[6px] border-l-amber-600">
                <p className="font-bold">
                  {item.scheme} · {item.version}
                </p>
                <p>{item.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
