import { HOUSEHOLD_SCOPE } from '@rec/common';
import { DataTypes, Model } from 'sequelize';

export class SessionModel extends Model {}

export class HouseholdMemberModel extends Model {}

export class FactModel extends Model {}

/** Registers models; tables come from Sequelize CLI migrations. */
export function initModels(sequelize) {
  SessionModel.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      language: { type: DataTypes.STRING(8), allowNull: false },
      consentAt: { type: DataTypes.DATE, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
    },
    { sequelize, tableName: 'sessions' },
  );
  HouseholdMemberModel.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      ref: { type: DataTypes.STRING(16), allowNull: true },
      relation: {
        type: DataTypes.ENUM('self', 'spouse', 'parent', 'child', 'sibling', 'other'),
        allowNull: false,
      },
    },
    { sequelize, tableName: 'household_members' },
  );
  FactModel.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      memberId: { type: DataTypes.CHAR(36), allowNull: false, defaultValue: HOUSEHOLD_SCOPE },
      key: { type: DataTypes.STRING(64), allowNull: false },
      value: { type: DataTypes.JSON, allowNull: false },
      origin: { type: DataTypes.ENUM('typed', 'voice', 'ocr'), allowNull: false },
      confidence: { type: DataTypes.FLOAT, allowNull: true },
      confirmed: { type: DataTypes.BOOLEAN, allowNull: false },
      updatedAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'facts' },
  );
  SessionModel.hasMany(HouseholdMemberModel, { foreignKey: 'sessionId', as: 'members' });
  SessionModel.hasMany(FactModel, { foreignKey: 'sessionId', as: 'facts' });
}
