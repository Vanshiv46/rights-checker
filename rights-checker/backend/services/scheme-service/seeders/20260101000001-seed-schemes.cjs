'use strict';

const { schemes } = require('../seed-data/schemes.json');

/**
 * Seeds the scheme catalogue: PM-KISAN and IGNOAPS as published versions, and
 * PMMVY, IGNWPS, IGNDPS, NFBS as DRAFT versions carrying TODO notes only.
 * @type {import('sequelize-cli').Seed}
 */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const stamp = { created_at: now, updated_at: now };
    const versions = schemes.flatMap((s) => s.versions.map((v) => ({ ...v, schemeId: s.id })));
    const documents = versions.flatMap((v) => v.sources.map((d) => ({ ...d, versionId: v.id })));

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkInsert(
        'schemes',
        schemes.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          description: s.description,
          ...stamp,
        })),
        { transaction },
      );
      await queryInterface.bulkInsert(
        'scheme_versions',
        versions.map((v) => ({
          id: v.id,
          scheme_id: v.schemeId,
          version: v.version,
          status: v.status,
          rule_json: JSON.stringify(v.rule),
          checklist_json: JSON.stringify(v.checklist),
          notes: v.notes,
          verified_on: v.verifiedOn,
          verified_by: v.verifiedBy,
          published_at: v.status === 'published' ? now : null,
          ...stamp,
        })),
        { transaction },
      );
      if (documents.length > 0) {
        await queryInterface.bulkInsert(
          'source_documents',
          documents.map((d) => ({
            id: d.id,
            scheme_version_id: d.versionId,
            title: d.title,
            section: d.section,
            url: d.url,
            ...stamp,
          })),
          { transaction },
        );
        await queryInterface.bulkInsert(
          'source_chunks',
          documents.flatMap((d) =>
            d.chunks.map((c, index) => ({
              id: c.id,
              source_document_id: d.id,
              chunk_index: index,
              text: c.text,
              embedding: null,
              ...stamp,
            })),
          ),
          { transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    const ids = schemes.map((s) => s.id);
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkDelete('scheme_versions', { scheme_id: ids }, { transaction });
      await queryInterface.bulkDelete('schemes', { id: ids }, { transaction });
    });
  },
};
