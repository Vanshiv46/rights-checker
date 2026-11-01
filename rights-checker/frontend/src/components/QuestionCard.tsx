import { useTranslation } from 'react-i18next';
import type { Question } from '../lib/types';
import { ListenButton } from './ListenButton';
import { VoiceButton } from './VoiceButton';

interface Props {
  question: Question;
  position: number;
  total: number;
  busy?: boolean;
  onAnswer: (value: boolean | null) => void;
  onVoiceText: (text: string) => void;
}

const ANSWERS = [
  { value: true, key: 'common.yes', mark: '✓', className: 'btn-answer btn-primary' },
  { value: false, key: 'common.no', mark: '✕', className: 'btn-answer btn-primary' },
  { value: null, key: 'common.dontKnow', mark: '?', className: 'btn-answer btn-secondary' },
] as const;

/** One question with tap answers (Yes / No / I don't know), optional voice and audio prompt. */
export function QuestionCard({
  question,
  position,
  total,
  busy = false,
  onAnswer,
  onVoiceText,
}: Props) {
  const { t } = useTranslation();
  const text = t(`questions.${question.id}.text`);
  const current = Math.min(position, total);
  const label = t('question.progress', { n: current, total });

  return (
    <section aria-labelledby="question-title" className="space-y-5">
      <div className="space-y-2">
        <p className="eyebrow">{label}</p>
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={current}
          className="h-2 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${(current / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-4xl leading-none">
            {question.icon}
          </span>
          <h1 id="question-title" className="text-2xl font-bold leading-snug">
            {text}
          </h1>
        </div>
        <p className="muted">{t(`questions.${question.id}.help`)}</p>
        <ListenButton text={text} />
      </div>

      <div className="grid gap-3" aria-busy={busy}>
        {ANSWERS.map((a) => (
          <button
            key={a.key}
            type="button"
            className={a.className}
            disabled={busy}
            onClick={() => onAnswer(a.value)}
          >
            <span
              aria-hidden="true"
              className="inline-flex size-7 items-center justify-center rounded-full border-2 border-current text-sm"
            >
              {a.mark}
            </span>
            {t(a.key)}
          </button>
        ))}
      </div>
      {busy && (
        <p role="status" className="muted">
          {t('question.saving')}
        </p>
      )}

      <div className="space-y-2 border-t border-line pt-4">
        <p className="text-sm muted">{t('question.or')}</p>
        <VoiceButton onTranscript={onVoiceText} />
      </div>
    </section>
  );
}
