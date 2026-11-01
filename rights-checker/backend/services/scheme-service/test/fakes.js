import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  checklistSchema,
  createLogger,
  createMemoryEventBus,
  ruleDefinitionSchema,
} from '@rec/common';
import { createApp } from '../src/app.js';

import { SchemeCatalogService } from '../src/services/scheme-catalog-service.js';

export const SERVICE_TOKEN = 'test-service-token-123';

export function loadSeed() {
  return JSON.parse(readFileSync(new URL('../seed-data/schemes.json', import.meta.url), 'utf8'));
}

/** In-memory SchemeRepository built from the real seed data. */
export class MemorySchemeRepository {
  schemes = [];
  versions = [];
  chunks = [];

  constructor() {
    for (const s of loadSeed().schemes) {
      const scheme = { id: s.id, code: s.code, name: s.name, description: s.description };
      this.schemes.push(scheme);
      for (const v of s.versions) {
        this.versions.push({
          ...v,
          rule: ruleDefinitionSchema.parse(v.rule),
          checklist: checklistSchema.parse(v.checklist),
          schemeId: s.id,
          schemeCode: s.code,
          schemeName: s.name,
        });
        for (const doc of v.sources) {
          for (const c of doc.chunks) {
            this.chunks.push({
              chunkId: c.id,
              documentTitle: doc.title,
              section: doc.section,
              text: c.text,
              score: 1,
              embedding: null,
              versionId: v.id,
            });
          }
        }
      }
    }
  }

  withPublished(scheme) {
    const published = this.versions.find(
      (v) => v.schemeId === scheme.id && v.status === 'published',
    );
    return { ...scheme, published: published ?? null };
  }

  async listSchemes(page) {
    const rows = this.schemes.slice(page.offset, page.offset + page.limit);
    return { rows: rows.map((s) => this.withPublished(s)), total: this.schemes.length };
  }
  async findSchemeByCode(code) {
    const scheme = this.schemes.find((s) => s.code === code);
    return scheme ? this.withPublished(scheme) : null;
  }
  async listPublishedVersions() {
    return this.versions.filter((v) => v.status === 'published');
  }
  async findVersion(id) {
    return this.versions.find((v) => v.id === id) ?? null;
  }
  async createDraftVersion(scheme, input) {
    const max = Math.max(
      0,
      ...this.versions.filter((v) => v.schemeId === scheme.id).map((v) => v.version),
    );
    const created = {
      id: randomUUID(),
      schemeId: scheme.id,
      schemeCode: scheme.code,
      schemeName: scheme.name,
      version: max + 1,
      status: 'draft',
      verifiedOn: null,
      verifiedBy: null,
      ...input,
    };
    this.versions.push(created);
    return created;
  }
  async markVerified(id, verifiedBy, verifiedOn) {
    const v = this.versions.find((x) => x.id === id);
    Object.assign(v, { verifiedBy, verifiedOn });
    return v;
  }
  async publishVersion(id) {
    const v = this.versions.find((x) => x.id === id);
    for (const other of this.versions) {
      if (other.schemeId === v.schemeId && other.status === 'published') other.status = 'retired';
    }
    v.status = 'published';
    return v;
  }
  async listDrafts(page) {
    const drafts = this.versions.filter((v) => v.status === 'draft');
    return { rows: drafts.slice(page.offset, page.offset + page.limit), total: drafts.length };
  }
  async searchChunks(versionId, query, limit) {
    const words = query.toLowerCase().split(/\s+/);
    return this.chunks
      .filter(
        (c) => c.versionId === versionId && words.some((w) => c.text.toLowerCase().includes(w)),
      )
      .slice(0, limit)
      .map(({ versionId: _v, ...hit }) => hit);
  }
}

export function buildTestApp(ready = true) {
  const repo = new MemorySchemeRepository();
  const bus = createMemoryEventBus();
  const logger = createLogger('scheme-service', 'silent');
  const catalog = new SchemeCatalogService(repo, bus, logger);
  const app = createApp({
    logger,
    serviceToken: SERVICE_TOKEN,
    catalog,
    readiness: async () => ({ mysql: ready }),
  });
  return { app, repo, bus, catalog };
}
