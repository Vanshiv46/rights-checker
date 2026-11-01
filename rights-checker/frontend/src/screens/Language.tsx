import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useSessionStore } from '../features/session/store';
import type { Language as Lang } from '../lib/types';

const LANGUAGE_BUTTON =
  'btn-primary w-full flex-col items-start gap-0 px-5 py-3 text-left disabled:opacity-60';

/** Entry screen: what the service does, privacy reassurance, and language choice as the CTA. */
export default function Language() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setLanguage = useSessionStore((s) => s.setLanguage);
  const sessionId = useSessionStore((s) => s.sessionId);
  const hasMembers = useSessionStore((s) => s.members.length > 0);

  const choose = (language: Lang) => {
    setLanguage(language);
    navigate('/consent');
  };

  const resumePath = hasMembers ? '/results' : '/household';

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{t('home.headline')}</h1>
        <p className="text-lg muted">{t('home.sub')}</p>
        <p className="text-sm font-semibold muted">{t('home.steps')}</p>
      </div>

      {sessionId && (
        <Link to={resumePath} className="btn-secondary w-full">
          {t('language.resume')}
        </Link>
      )}

      <div className="card space-y-3">
        <h2 className="text-lg font-bold">{t('home.start')}</h2>
        <button type="button" lang="hi" className={LANGUAGE_BUTTON} onClick={() => choose('hi')}>
          <span className="text-xl">{t('language.hi')}</span>
          <span className="text-sm font-normal opacity-90">{t('language.hiHint')}</span>
        </button>
        <button type="button" lang="en" className={LANGUAGE_BUTTON} onClick={() => choose('en')}>
          <span className="text-xl">{t('language.en')}</span>
          <span className="text-sm font-normal opacity-90">{t('language.enHint')}</span>
        </button>
      </div>

      <p className="note flex gap-3">
        <span aria-hidden="true">🔒</span>
        <span>{t('home.privacy')}</span>
      </p>
    </section>
  );
}
