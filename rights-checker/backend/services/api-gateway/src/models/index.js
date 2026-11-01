import { DataTypes, Model } from 'sequelize';

export class OperatorModel extends Model {}

export class AuditLogModel extends Model {}

/** Registers models; tables come from Sequelize CLI migrations. */
export function initModels(sequelize) {
  OperatorModel.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },
      role: { type: DataTypes.ENUM('operator', 'admin'), allowNull: false },
      active: { type: DataTypes.BOOLEAN, allowNull: false },
    },
    { sequelize, tableName: 'operators' },
  );
  AuditLogModel.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      operatorId: { type: DataTypes.CHAR(36), allowNull: true },
      action: { type: DataTypes.STRING(120), allowNull: false },
      resource: { type: DataTypes.STRING(64), allowNull: true },
      requestId: { type: DataTypes.STRING(128), allowNull: false },
      statusCode: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
      createdAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'audit_log', updatedAt: false },
  );
}
