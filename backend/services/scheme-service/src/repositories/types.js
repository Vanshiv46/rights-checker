/**
 * Persistence port for scheme-service; the Sequelize adapter and the test fake implement it.
 *
 * @typedef {object} SchemeRecord
 * @property {string} id
 * @property {string} code
 * @property {string} name
 * @property {string} description
 *
 * @typedef {object} VersionRecord
 * @property {string} id
 * @property {string} schemeId
 * @property {string} schemeCode
 * @property {string} schemeName
 * @property {number} version
 * @property {'draft' | 'published' | 'retired'} status
 * @property {object} rule       Rule definition (see ruleDefinitionSchema in @rec/common)
 * @property {object} checklist  Checklist (see checklistSchema in @rec/common)
 * @property {string | null} notes
 * @property {string | null} verifiedOn
 * @property {string | null} verifiedBy
 *
 * @typedef {SchemeRecord & { published: VersionRecord | null }} SchemeWithPublished
 *
 * @typedef {object} ChunkHit
 * @property {string} chunkId
 * @property {string} documentTitle
 * @property {string | null} section
 * @property {string} text
 * @property {number} score
 * @property {number[] | null} embedding
 *
 * @typedef {object} SchemeRepository
 * @property {(page: {limit: number, offset: number}) => Promise<{rows: SchemeWithPublished[], total: number}>} listSchemes
 * @property {(code: string) => Promise<SchemeWithPublished | null>} findSchemeByCode
 * @property {() => Promise<VersionRecord[]>} listPublishedVersions
 * @property {(id: string) => Promise<VersionRecord | null>} findVersion
 * @property {(scheme: SchemeRecord, input: {rule: object, checklist: object, notes: string | null}) => Promise<VersionRecord>} createDraftVersion
 * @property {(id: string, verifiedBy: string, verifiedOn: string) => Promise<VersionRecord>} markVerified
 * @property {(id: string) => Promise<VersionRecord>} publishVersion
 * @property {(page: {limit: number, offset: number}) => Promise<{rows: VersionRecord[], total: number}>} listDrafts
 * @property {(versionId: string, query: string, limit: number) => Promise<ChunkHit[]>} searchChunks
 */

export {};
