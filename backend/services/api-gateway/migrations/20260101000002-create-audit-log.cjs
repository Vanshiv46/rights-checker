'use strict';

const TABLE_OPTIONS = { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci', engine: 'InnoDB' };

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'audit_log',
      {
        id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
        operator_id: {
          type: Sequelize.CHAR(36),
          allowNull: true,
          references: { model: 'operators', key: 'id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        },
        action: { type: Sequelize.STRING(120), allowNull: false },
        resource: { type: Sequelize.STRING(64), allowNull: true },
        request_id: { type: Sequelize.STRING(128), allowNull: false },
        status_code: { type: Sequelize.SMALLINT.UNSIGNED, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex('audit_log', ['operator_id', 'created_at'], {
      name: 'ix_audit_log_operator_created',
    });
    await queryInterface.addIndex('audit_log', ['created_at'], { name: 'ix_audit_log_created' });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('audit_log');
  },
};
