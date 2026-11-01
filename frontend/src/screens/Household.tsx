import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FormFieldInput } from '../components/FormFieldInput';
import { ErrorState } from '../components/StateViews';
import { useSubmitAnswer } from '../features/session/hooks';
import { useHouseholdForm } from '../features/session/useHouseholdForm';
import type { Occupation, Relation, Sex } from '../lib/types';

const RELATIONS: Relation[] = ['self', 'spouse', 'mother', 'father', 'son', 'daughter', 'other'];
const SEXES: Sex[] = ['female', 'male', 'other'];

/** The one household form: each person's details and occupation, then the questions that follow. */
export default function Household() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const form = useHouseholdForm();
  const submit = useSubmitAnswer();
  const lang = i18n.language === 'hi' ? 'hi' : 'en';

  const send = () => {
    const payload = form.build();
    if (payload) submit.mutate({ form: payload }, { onSuccess: () => navigate('/results') });
  };

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('household.title')}</h1>
        <p className="muted">{t('household.intro')}</p>
      </div>

      <ul className="space-y-4">
        {form.members.map((m, index) => {
          const base = `member-${m.id}`;
          const questions = form.shown.byMember[m.id] ?? [];
          const ageBad = form.showErrors && !form.ageOk(m);
          return (
            <li key={m.id} className="card space-y-4" aria-labelledby={`${base}-title`}>
              <div className="flex items-center justify-between gap-3">
                <h2 id={`${base}-title`} className="eyebrow">
                  {t('form.person', { n: index + 1 })}
                </h2>
                {form.members.length > 1 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    aria-label={`${t('household.remove')}: ${t('form.person', { n: index + 1 })}`}
                    onClick={() => form.remove(m.id)}
                  >
                    {t('household.remove')}
                  </button>
                )}
              </div>
              <div>
                <label htmlFor={`${base}-relation`} className="label">
                  {t('household.relation')}
                </label>
                <select
                  id={`${base}-relation`}
                  className="field"
                  value={m.relation}
                  onChange={(e) => form.update(m.id, { relation: e.target.value as Relation })}
                >
                  {RELATIONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`relations.${r}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${base}-age`} className="label">
                  {t('household.age')}
                </label>
                <input
                  id={`${base}-age`}
                  className="field"
                  inputMode="numeric"
                  value={Number.isNaN(m.age) ? '' : String(m.age)}
                  aria-invalid={ageBad}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    form.update(m.id, { age: digits === '' ? Number.NaN : Number(digits) });
                  }}
                />
                {ageBad && (
                  <p role="alert" className="mt-1 font-semibold text-red-800">
                    {t('household.ageError')}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor={`${base}-sex`} className="label">
                  {t('household.sex')}
                </label>
                <select
                  id={`${base}-sex`}
                  className="field"
                  value={m.sex}
                  onChange={(e) => form.update(m.id, { sex: e.target.value as Sex })}
                >
                  {SEXES.map((s) => (
                    <option key={s} value={s}>
                      {t(`sex.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${base}-occupation`} className="label">
                  {t('form.occupation')}
                </label>
                <select
                  id={`${base}-occupation`}
                  className="field"
                  value={m.occupation ?? ''}
                  onChange={(e) =>
                    form.update(m.id, {
                      occupation:
                        e.target.value === '' ? undefined : (e.target.value as Occupation),
                    })
                  }
                >
                  <option value="">{t('form.choose')}</option>
                  {form.occupations.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label[lang]}
                    </option>
                  ))}
                </select>
              </div>

              {questions.length > 0 && (
                <div className="space-y-4 border-t-2 border-line pt-4" aria-live="polite">
                  {questions.map((f) => (
                    <FormFieldInput
                      key={f.id}
                      field={f}
                      value={form.values.byMember[m.id]?.[f.fact]}
                      onChange={(v) => form.setMemberValue(m.id, f.fact, v)}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button type="button" className="btn-secondary w-full" onClick={form.add}>
        {t('household.add')}
      </button>

      {form.shown.household.length > 0 && (
        <div className="card space-y-4" aria-live="polite">
          <h2 className="eyebrow">{t('form.householdTitle')}</h2>
          {form.shown.household.map((f) => (
            <FormFieldInput
              key={f.id}
              field={f}
              value={form.values.household[f.fact]}
              onChange={(v) => form.setHouseholdValue(f.fact, v)}
            />
          ))}
        </div>
      )}

      <p className="note">{t('form.skipNote')}</p>
      {submit.isError && <ErrorState onRetry={() => submit.reset()} />}
      <button
        type="button"
        className="btn-primary w-full"
        disabled={submit.isPending}
        onClick={send}
      >
        {submit.isPending ? t('common.loading') : t('form.seeResults')}
      </button>
    </section>
  );
}
