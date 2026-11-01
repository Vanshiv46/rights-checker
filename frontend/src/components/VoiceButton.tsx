import { useTranslation } from 'react-i18next';
import { useOnline } from '../features/session/useOnline';
import { useSessionStore } from '../features/session/store';
import { isVoiceSupported, useVoiceInput } from '../features/voice/useVoiceInput';

/** Microphone button. Hidden offline or when the browser cannot record. */
export function VoiceButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const { t } = useTranslation();
  const online = useOnline();
  const language = useSessionStore((s) => s.language);
  const { state, toggle } = useVoiceInput(language, onTranscript);

  if (!online || !isVoiceSupported()) return null;
  const recording = state === 'recording';
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={recording ? 'btn-danger w-full' : 'btn-secondary w-full'}
        onClick={toggle}
        disabled={state === 'processing'}
      >
        <span aria-hidden="true">{recording ? '⏹' : '🎤'}</span>
        {recording ? t('question.stop') : t('question.speak')}
      </button>
      {state === 'processing' && <p role="status">{t('question.processing')}</p>}
      {state === 'error' && <p role="alert">{t('question.voiceError')}</p>}
    </div>
  );
}
