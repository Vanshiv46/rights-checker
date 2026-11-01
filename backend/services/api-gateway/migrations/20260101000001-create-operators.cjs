'use strict';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' };

/** Staff accounts (operators/admins). Citizens never get accounts. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'operators',
      {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        email: { type: Sequelize.STRING(254), allowNull: false, unique: true },
        password_hash: { type: Sequelize.STRING(255), allowNull: false },
        role: { type: Sequelize.ENUM('operator', 'admin'), allowNull: false },
        active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
  },
  async down(queryInterface) {
    await queryInterface.dropTable('operators');
  },
};
