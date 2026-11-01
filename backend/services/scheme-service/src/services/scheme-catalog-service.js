import { buildEvent, currentRequestId, Errors } from '@rec/common';

import { rerankByEmbedding } from './ranking.js';

export const SEARCH_TOP_K = 20;

function toSummary(scheme) {
  const { published } = scheme;
  return {
    code: scheme.code,
    name: scheme.name,
    description: scheme.description,
    publishedVersion: published
      ? { id: published.id, version: published.version, verifiedOn: published.verifiedOn }
      : null,
  };
}

function toVersionDto(v) {
  return {
    id: v.id,
    schemeCode: v.schemeCode,
    version: v.version,
    status: v.status,
    verifiedOn: v.verifiedOn,
    verifiedBy: v.verifiedBy,
    notes: v.notes,
  };
}

function toPublishedRule(v) {
  return {
    schemeCode: v.schemeCode,
    schemeName: v.schemeName,
    versionId: v.id,
    version: v.version,
    rule: v.rule,
    checklist: v.checklist,
    verifiedOn: v.verifiedOn,
  };
}

const today = () => new Date().toISOString().slice(0, 10);

/** Scheme catalogue, rule versions, verification workflow, publishing and source retrieval. */
export class SchemeCatalogService {
  constructor(repo, bus, logger) {
    this.repo = repo;
    this.bus = bus;
    this.logger = logger;
  }

  /** Lists schemes with their currently published version (paginated). */
  async listSchemes(page) {
    const { rows, total } = await this.repo.listSchemes(page);
    return { rows: rows.map(toSummary), total };
  }

  /** One scheme with its published rule and checklist; 404 when the code is unknown. */
  async getScheme(code) {
    const scheme = await this.repo.findSchemeByCode(code);
    if (!scheme) throw Errors.notFound('Scheme');
    return {
      ...toSummary(scheme),
      rule: scheme.published?.rule ?? null,
      checklist: scheme.published?.checklist ?? null,
    };
  }

  /** Every published rule version; eligibility-service caches these. */
  async listPublishedRules() {
    return (await this.repo.listPublishedVersions()).map(toPublishedRule);
  }

  /** Creates the next draft version of a scheme's rules. */
  async createVersion(code, body) {
    const scheme = await this.repo.findSchemeByCode(code);
    if (!scheme) throw Errors.notFound('Scheme');
    const created = await this.repo.createDraftVersion(scheme, {
      rule: body.rule,
      checklist: body.checklist,
      notes: body.notes ?? null,
    });
    return toVersionDto(created);
  }

  /** Records who checked a draft against its source; required before publishing. */
  async verifyVersion(id, verifiedBy) {
    const version = await this.mustFindVersion(id);
    if (version.status !== 'draft') {
      throw Errors.conflict('VERSION_NOT_DRAFT', 'Only draft versions can be verified');
    }
    return toVersionDto(await this.repo.markVerified(id, verifiedBy, today()));
  }

  /** Publishes a verified draft, retiring the previous version, then emits rule.published. */
  async publishVersion(id) {
    const version = await this.mustFindVersion(id);
    if (version.status !== 'draft') {
      throw Errors.conflict('VERSION_NOT_DRAFT', `Version is already ${version.status}`);
    }
    if (!version.verifiedOn) {
      throw Errors.conflict('VERSION_NOT_VERIFIED', 'Verify the version before publishing');
    }
    if (version.rule.requirements.length === 0) {
      throw Errors.unprocessable('RULE_INCOMPLETE', 'A rule needs at least one requirement');
    }
    const published = await this.repo.publishVersion(id);
    await this.bus.publish(
      buildEvent(
        'rule.published',
        { schemeCode: published.schemeCode, versionId: published.id, version: published.version },
        currentRequestId(),
      ),
    );
    this.logger.info(
      { schemeCode: published.schemeCode, version: published.version },
      'rule published',
    );
    return toVersionDto(published);
  }

  /** Drafts waiting for verification or publishing. */
  async verificationQueue(page) {
    const { rows, total } = await this.repo.listDrafts(page);
    return { rows: rows.map(toVersionDto), total };
  }

  /** FULLTEXT search within one version's sources, top 20, re-ranked by embeddings if present. */
  async searchSources(body) {
    await this.mustFindVersion(body.schemeVersionId);
    const hits = await this.repo.searchChunks(body.schemeVersionId, body.query, SEARCH_TOP_K);
    return rerankByEmbedding(hits, body.embedding).map(({ embedding: _unused, ...hit }) => hit);
  }

  async mustFindVersion(id) {
    const version = await this.repo.findVersion(id);
    if (!version) throw Errors.notFound('Scheme version');
    return version;
  }
}
