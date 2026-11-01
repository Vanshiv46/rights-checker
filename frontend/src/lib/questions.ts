import type { Question } from './types';

/** Question order used offline and by the mock API. Texts live in the i18n files. */
export const QUESTION_BANK: Question[] = [
  { id: 'land', factKey: 'household.owns_cultivable_land', scope: 'household', icon: '🌾' },
  { id: 'tax', factKey: 'any_member.paid_income_tax_last_ay', scope: 'household', icon: '🧾' },
  { id: 'pension', factKey: 'any_member.monthly_pension', scope: 'household', icon: '👴' },
  { id: 'bpl', factKey: 'household.bpl_status', scope: 'household', icon: '🏠' },
];

/** The question after `currentId`, or the first one when `currentId` is null. */
export function nextBankQuestion(currentId: string | null): Question | null {
  if (currentId === null) return QUESTION_BANK[0] ?? null;
  const index = QUESTION_BANK.findIndex((q) => q.id === currentId);
  return QUESTION_BANK[index + 1] ?? null;
}
