/** Locale-aware short date for ISO strings such as `2026-11-01` or full timestamps. */
export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}
