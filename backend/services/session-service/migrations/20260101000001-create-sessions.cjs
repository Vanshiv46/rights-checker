'use strict';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' };

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'sessions',
      {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        language: { type: Sequelize.STRING(8), allowNull: false },
        consent_at: { type: Sequelize.DATE, allowNull: false },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('sessions', ['expires_at'], { name: 'ix_sessions_expires_at' });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('sessions');
  },
};
