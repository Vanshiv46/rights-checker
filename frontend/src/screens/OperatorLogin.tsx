import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOperatorLogin } from '../features/session/hooks';

export default function OperatorLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useOperatorLogin();
  const [cscId, setCscId] = useState('');
  const [password, setPassword] = useState('');

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">{t('operator.title')}</h1>
      <div className="card space-y-4">
        <div>
          <label htmlFor="csc" className="label">
            {t('operator.cscId')}
          </label>
          <input
            id="csc"
            className="field"
            autoComplete="username"
            value={cscId}
            onChange={(e) => setCscId(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            {t('operator.password')}
          </label>
          <input
            id="password"
            type="password"
            className="field"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {login.isError && (
          <p role="alert" className="font-semibold text-red-900">
            {t('operator.error')}
          </p>
        )}
        <button
          type="button"
          className="btn-primary w-full"
          disabled={!cscId || !password || login.isPending}
          onClick={() => login.mutate({ cscId, password }, { onSuccess: () => navigate('/') })}
        >
          {login.isPending ? t('common.loading') : t('operator.login')}
        </button>
      </div>
    </section>
  );
}
