/**
 * Persistence port for session-service.
 *
 * @typedef {object} SessionRecord
 * @property {string} id
 * @property {string} language
 * @property {Date} consentAt
 * @property {Date} expiresAt
 *
 * @typedef {object} MemberRecord
 * @property {string} id
 * @property {string | null} ref       Short client reference, never a name
 * @property {'self' | 'spouse' | 'parent' | 'child' | 'sibling' | 'other'} relation
 *
 * @typedef {object} FactRecord
 * @property {string | null} memberId  null for household-level facts
 * @property {string} key              A key from FACT_CATALOGUE
 * @property {boolean | number | string} value
 * @property {'typed' | 'voice' | 'ocr'} origin
 * @property {number | null} confidence
 * @property {boolean} confirmed
 *
 * @typedef {SessionRecord & { members: MemberRecord[], facts: FactRecord[] }} SessionAggregate
 *
 * @typedef {object} SessionRepository
 * @property {(session: SessionRecord) => Promise<void>} create
 * @property {(id: string) => Promise<SessionAggregate | null>} findAggregate
 *   Session with members and facts in one eager-loaded query.
 * @property {(sessionId: string, members: MemberRecord[], facts: FactRecord[]) => Promise<void>} saveAnswers
 *   Inserts new members and upserts facts in one transaction.
 * @property {(id: string) => Promise<boolean>} delete
 *   Deletes the session and (by cascade) its members and facts.
 * @property {(now: Date, limit: number) => Promise<string[]>} findExpiredIds
 */

export {};
