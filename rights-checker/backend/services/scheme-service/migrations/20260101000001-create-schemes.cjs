'use strict';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' };

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'schemes',
      {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        code: { type: Sequelize.STRING(32), allowNull: false, unique: true },
        name: { type: Sequelize.STRING(200), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
  },
  async down(queryInterface) {
    await queryInterface.dropTable('schemes');
  },
};
