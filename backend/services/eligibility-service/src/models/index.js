import { DataTypes, Model } from 'sequelize';

/** One scheme verdict for one session. session_id / scheme_version_id are plain ids (no cross-DB FKs). */
export class EvaluationModel extends Model {}

export function initModels(sequelize) {
  EvaluationModel.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      sessionId: { type: DataTypes.CHAR(36), allowNull: false },
      schemeVersionId: { type: DataTypes.CHAR(36), allowNull: false },
      schemeCode: { type: DataTypes.STRING(32), allowNull: false },
      verdict: {
        type: DataTypes.ENUM('LIKELY', 'NEEDS_VERIFICATION', 'NOT_ELIGIBLE'),
        allowNull: false,
      },
      firedRules: { type: DataTypes.JSON, allowNull: false },
      missingFacts: { type: DataTypes.JSON, allowNull: false },
      resultJson: { type: DataTypes.JSON, allowNull: false },
      createdAt: DataTypes.DATE,
    },
    { sequelize, tableName: 'evaluations' },
  );
}
