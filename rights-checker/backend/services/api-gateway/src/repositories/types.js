/**
 * Persistence ports for the gateway's auth_db.
 *
 * @typedef {object} OperatorRecord
 * @property {string} id
 * @property {string} passwordHash
 * @property {'operator' | 'admin'} role
 *
 * @typedef {object} AuditEntry
 * @property {string | null} operatorId
 * @property {string} action
 * @property {string | null} resource
 * @property {string} requestId
 * @property {number} statusCode
 *
 * @typedef {object} OperatorRepository
 * @property {(email: string) => Promise<OperatorRecord | null>} findActiveByEmail
 *
 * @typedef {object} AuditRepository
 * @property {(entry: AuditEntry) => Promise<void>} record
 */

export {};
