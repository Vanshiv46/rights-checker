import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { FormField, FormValue } from '../lib/types';

interface Props {
  field: FormField;
  value: FormValue | undefined;
  onChange: (value: FormValue | undefined) => void;
}

const CHOICES = [
  { value: true, key: 'common.yes' },
  { value: false, key: 'common.no' },
] as const;

/** One follow-up question: Yes / No / I don't know, a number, or a pick-list. */
export function FormFieldInput({ field, value, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const lang = i18n.language === 'hi' ? 'hi' : 'en';
  const label = field.label[lang];

  if (field.type === 'boolean') {
    return (
      <fieldset className="space-y-2">
        <legend className="label">{label}</legend>
        <div className="grid grid-cols-3 gap-2">
          {CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={value === c.value}
              className={`btn min-h-12 ${value === c.value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onChange(c.value)}
            >
              {t(c.key)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={value === undefined}
            className={`btn min-h-12 ${value === undefined ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onChange(undefined)}
          >
            {t('common.dontKnow')}
          </button>
        </div>
      </fieldset>
    );
  }

  if (field.type === 'number') {
    return (
      <div>
        <label htmlFor={id} className="label">
          {label}
        </label>
        <input
          id={id}
          className="field"
          inputMode="numeric"
          value={typeof value === 'number' ? String(value) : ''}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            onChange(digits === '' ? undefined : Number(digits));
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select
        id={id}
        className="field"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      >
        <option value="">{t('form.choose')}</option>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label[lang]}
          </option>
        ))}
      </select>
    </div>
  );
}
