const PATTERNS = [
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/gu, // Aadhaar-like 12 digits
  /(?:\+91[\s-]?)?\b[6-9]\d{9}\b/gu, // Indian mobile numbers
  /[\w.+-]+@[\w-]+\.[\w.-]+/gu, // e-mail addresses
];

/** Strips identifiers (Aadhaar, phone, e-mail) before any text reaches an LLM prompt. */
export function redactIdentifiers(text) {
  return PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '[redacted]'), text);
}
