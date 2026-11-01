import { randomUUID } from 'node:crypto';
import { checklistSchema, ruleDefinitionSchema } from '@rec/common';
import { QueryTypes } from 'sequelize';
import { z } from 'zod';
import { SchemeModel, SchemeVersionModel } from '../models/index.js';

const VERSION_ATTRIBUTES = [
  'id',
  'schemeId',
  'version',
  'status',
  'ruleJson',
  'checklistJson',
  'notes',
  'verifiedOn',
  'verifiedBy',
];
const SCHEME_ATTRIBUTES = ['id', 'code', 'name', 'description'];

const jsonColumn = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

const hitRowSchema = z.object({
  chunkId: z.string(),
  documentTitle: z.string(),
  section: z.string().nullable(),
  text: z.string(),
  score: z.coerce.number(),
  embedding: z.preprocess(jsonColumn, z.array(z.number()).nullable()),
});

function toVersionRecord(row, scheme) {
  return {
    id: row.id,
    schemeId: scheme.id,
    schemeCode: scheme.code,
    schemeName: scheme.name,
    version: row.version,
    status: row.status,
    rule: ruleDefinitionSchema.parse(jsonColumn(row.ruleJson)),
    checklist: checklistSchema.parse(jsonColumn(row.checklistJson)),
    notes: row.notes,
    verifiedOn: row.verifiedOn,
    verifiedBy: row.verifiedBy,
  };
}

function toSchemeRecord(row) {
  return { id: row.id, code: row.code, name: row.name, description: row.description };
}

function withPublished(row) {
  const scheme = toSchemeRecord(row);
  const published = row.versions?.[0];
  return { ...scheme, published: published ? toVersionRecord(published, scheme) : null };
}

/** MySQL implementation of SchemeRepository (eager loading, selected attributes, transactions). */
export class SequelizeSchemeRepository {
  constructor(sequelize) {
    this.sequelize = sequelize;
  }

  publishedInclude() {
    return {
      model: SchemeVersionModel,
      as: 'versions',
      required: false,
      where: { status: 'published' },
      attributes: [...VERSION_ATTRIBUTES],
    };
  }

  async listSchemes(page) {
    const total = await SchemeModel.count();
    const rows = await SchemeModel.findAll({
      attributes: [...SCHEME_ATTRIBUTES],
      include: [this.publishedInclude()],
      order: [['code', 'ASC']],
      limit: page.limit,
      offset: page.offset,
    });
    return { rows: rows.map(withPublished), total };
  }

  async findSchemeByCode(code) {
    const row = await SchemeModel.findOne({
      where: { code },
      attributes: [...SCHEME_ATTRIBUTES],
      include: [this.publishedInclude()],
    });
    return row ? withPublished(row) : null;
  }

  async loadVersions(where, page) {
    const { rows, count } = await SchemeVersionModel.findAndCountAll({
      where,
      attributes: [...VERSION_ATTRIBUTES],
      include: [{ model: SchemeModel, as: 'scheme', attributes: [...SCHEME_ATTRIBUTES] }],
      order: [['createdAt', 'ASC']],
      ...(page ? { limit: page.limit, offset: page.offset } : {}),
    });
    const records = rows.map((row) => {
      if (!row.scheme) throw new Error('scheme_versions row without scheme');
      return toVersionRecord(row, toSchemeRecord(row.scheme));
    });
    return { rows: records, total: count };
  }

  async listPublishedVersions() {
    return (await this.loadVersions({ status: 'published' })).rows;
  }

  async findVersion(id) {
    return (await this.loadVersions({ id })).rows[0] ?? null;
  }

  async createDraftVersion(scheme, input) {
    const id = randomUUID();
    await this.sequelize.transaction(async (transaction) => {
      // Lock the scheme row so concurrent drafts get distinct version numbers.
      await SchemeModel.findByPk(scheme.id, { attributes: ['id'], transaction, lock: true });
      const current = await SchemeVersionModel.max('version', {
        where: { schemeId: scheme.id },
        transaction,
      });
      await SchemeVersionModel.create(
        {
          id,
          schemeId: scheme.id,
          version: (current || 0) + 1,
          status: 'draft',
          ruleJson: input.rule,
          checklistJson: input.checklist,
          notes: input.notes,
          verifiedOn: null,
          verifiedBy: null,
        },
        { transaction },
      );
    });
    return this.mustFind(id);
  }

  async markVerified(id, verifiedBy, verifiedOn) {
    await SchemeVersionModel.update({ verifiedBy, verifiedOn }, { where: { id } });
    return this.mustFind(id);
  }

  async publishVersion(id) {
    await this.sequelize.transaction(async (transaction) => {
      const target = await SchemeVersionModel.findByPk(id, {
        attributes: ['id', 'schemeId'],
        transaction,
        lock: true,
      });
      if (!target) throw new Error('version vanished during publish');
      await SchemeVersionModel.update(
        { status: 'retired' },
        { where: { schemeId: target.schemeId, status: 'published' }, transaction },
      );
      await SchemeVersionModel.update(
        { status: 'published', publishedAt: new Date() },
        { where: { id }, transaction },
      );
    });
    return this.mustFind(id);
  }

  async listDrafts(page) {
    return this.loadVersions({ status: 'draft' }, page);
  }

  /** FULLTEXT MATCH ... AGAINST limited to one scheme version; parameterised replacements only. */
  async searchChunks(versionId, query, limit) {
    const rows = await this.sequelize.query(
      `SELECT c.id AS chunkId, d.title AS documentTitle, d.section AS section, c.text AS text,
              c.embedding AS embedding,
              MATCH(c.text) AGAINST (:query IN NATURAL LANGUAGE MODE) AS score
         FROM source_chunks c
         JOIN source_documents d ON d.id = c.source_document_id
        WHERE d.scheme_version_id = :versionId
          AND MATCH(c.text) AGAINST (:query IN NATURAL LANGUAGE MODE)
        ORDER BY score DESC
        LIMIT :limit`,
      { replacements: { query, versionId, limit }, type: QueryTypes.SELECT },
    );
    return z.array(hitRowSchema).parse(rows);
  }

  async mustFind(id) {
    const found = await this.findVersion(id);
    if (!found) throw new Error(`scheme version ${id} not found after write`);
    return found;
  }
}
