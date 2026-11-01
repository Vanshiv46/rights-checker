'use strict';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' };

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'source_chunks',
      {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        source_document_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'source_documents', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        chunk_index: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
        text: { type: Sequelize.TEXT, allowNull: false },
        embedding: { type: Sequelize.JSON, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('source_chunks', ['source_document_id', 'chunk_index'], {
      unique: true,
      name: 'uq_source_chunks_document_index',
    });
    await queryInterface.addIndex('source_chunks', ['text'], {
      type: 'FULLTEXT',
      name: 'ft_source_chunks_text',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('source_chunks');
  },
};
