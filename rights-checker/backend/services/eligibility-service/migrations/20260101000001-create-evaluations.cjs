'use strict';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' };

/** session_id and scheme_version_id belong to other services: stored as plain ids, no FKs. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'evaluations',
      {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        session_id: { type: Sequelize.CHAR(36), allowNull: false },
        scheme_version_id: { type: Sequelize.CHAR(36), allowNull: false },
        scheme_code: { type: Sequelize.STRING(32), allowNull: false },
        verdict: {
          type: Sequelize.ENUM('LIKELY', 'NEEDS_VERIFICATION', 'NOT_ELIGIBLE'),
          allowNull: false,
        },
        fired_rules: { type: Sequelize.JSON, allowNull: false },
        missing_facts: { type: Sequelize.JSON, allowNull: false },
        result_json: { type: Sequelize.JSON, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('evaluations', ['session_id', 'scheme_version_id'], {
      unique: true,
      name: 'uq_evaluations_session_version',
    });
    await queryInterface.addIndex('evaluations', ['scheme_version_id'], {
      name: 'ix_evaluations_scheme_version',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('evaluations');
  },
};
