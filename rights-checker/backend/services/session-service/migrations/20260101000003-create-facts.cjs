'use strict';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' };
/** member_id for household-level facts, so the unique key below never contains NULL. */
const HOUSEHOLD_SCOPE = '00000000-0000-0000-0000-000000000000';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'facts',
      {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        session_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'sessions', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        member_id: { type: Sequelize.CHAR(36), allowNull: false, defaultValue: HOUSEHOLD_SCOPE },
        key: { type: Sequelize.STRING(64), allowNull: false },
        value: { type: Sequelize.JSON, allowNull: false },
        origin: { type: Sequelize.ENUM('typed', 'voice', 'ocr'), allowNull: false },
        confidence: { type: Sequelize.FLOAT, allowNull: true },
        confirmed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('facts', ['session_id', 'member_id', 'key'], {
      unique: true,
      name: 'uq_facts_session_member_key',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('facts');
  },
};
