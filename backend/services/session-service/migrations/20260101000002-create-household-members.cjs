'use strict';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' };

/** Members carry a relation and a short client ref only: never names or identifiers. */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'household_members',
      {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        session_id: {
          type: Sequelize.CHAR(36),
          allowNull: false,
          references: { model: 'sessions', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        ref: { type: Sequelize.STRING(16), allowNull: true },
        relation: {
          type: Sequelize.ENUM('self', 'spouse', 'parent', 'child', 'sibling', 'other'),
          allowNull: false,
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('household_members', ['session_id', 'ref'], {
      unique: true,
      name: 'uq_household_members_session_ref',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('household_members');
  },
};
