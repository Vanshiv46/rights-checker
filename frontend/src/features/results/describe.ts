import type { TFunction } from 'i18next';
import type { SchemeResult } from '../../lib/types';

const FACT_EQUALS = /^([a-z_]+\.[a-z_0-9]+) = (true|false)$/;
const FACT_TOKEN = /\b[a-z_]+\.[a-z_0-9]+\b/g;

/** Plain-language label for a fact key such as `household.bpl_status`. */
export function factLabel(t: TFunction, key: string): string {
  return t(`facts.${key}`, { defaultValue: key });
}

/** Turns an engine reason like `household.owns_cultivable_land = true` into readable text. */
export function describeReason(t: TFunction, reason: string): string {
  const match = FACT_EQUALS.exec(reason);
  if (match) {
    const answer = t(match[2] === 'true' ? 'common.yes' : 'common.no');
    return `${factLabel(t, match[1] ?? '')}: ${answer}`;
  }
  return reason.replace(FACT_TOKEN, (key) => factLabel(t, key));
}

/** The single line shown on a scheme card. */
export function reasonLine(t: TFunction, result: SchemeResult): string {
  if (result.verdict === 'NEEDS_VERIFICATION' && result.missingFacts?.length) {
    return t('card.needs', {
      facts: result.missingFacts.map((key) => factLabel(t, key)).join(', '),
    });
  }
  const first = result.reasons[0];
  return first ? describeReason(t, first) : '';
}
