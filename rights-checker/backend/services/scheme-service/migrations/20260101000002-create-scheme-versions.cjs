'use strict';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' };

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'scheme_versions',
      {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        scheme_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'schemes', key: 'id' },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
        },
        version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
        status: {
          type: Sequelize.ENUM('draft', 'published', 'retired'),
          allowNull: false,
          defaultValue: 'draft',
        },
        rule_json: { type: Sequelize.JSON, allowNull: false },
        checklist_json: { type: Sequelize.JSON, allowNull: false },
        notes: { type: Sequelize.TEXT, allowNull: true },
        verified_on: { type: Sequelize.DATEONLY, allowNull: true },
        verified_by: { type: Sequelize.STRING(64), allowNull: true },
        published_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('scheme_versions', ['scheme_id', 'version'], {
      unique: true,
      name: 'uq_scheme_versions_scheme_version',
    });
    await queryInterface.addIndex('scheme_versions', ['status'], {
      name: 'ix_scheme_versions_status',
    });
    await queryInterface.addIndex('scheme_versions', ['scheme_id', 'status'], {
      name: 'ix_scheme_versions_scheme_status',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('scheme_versions');
  },
};
