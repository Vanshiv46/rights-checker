import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../features/session/store';
import { useOnline } from '../features/session/useOnline';
import { useSpeak } from '../features/voice/useSpeak';

/** Plays the question aloud. Hidden offline; the question text is always on screen. */
export function ListenButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const online = useOnline();
  const language = useSessionStore((s) => s.language);
  const { speak, busy, failed } = useSpeak(language);

  if (!online) return null;
  return (
    <div>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => void speak(text)}
        disabled={busy}
      >
        <span aria-hidden="true">🔊</span>
        {t('question.listen')}
      </button>
      {failed && <p role="alert">{t('question.listenError')}</p>}
    </div>
  );
}
