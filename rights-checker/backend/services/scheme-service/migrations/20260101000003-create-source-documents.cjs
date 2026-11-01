'use strict';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' };

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'source_documents',
      {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        scheme_version_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'scheme_versions', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        title: { type: Sequelize.STRING(200), allowNull: false },
        section: { type: Sequelize.STRING(50), allowNull: true },
        url: { type: Sequelize.STRING(500), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('source_documents', ['scheme_version_id'], {
      name: 'ix_source_documents_version',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('source_documents');
  },
};
