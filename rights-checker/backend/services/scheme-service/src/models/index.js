import { DataTypes, Model } from 'sequelize';

export class SchemeModel extends Model {}

export class SchemeVersionModel extends Model {}

export class SourceDocumentModel extends Model {}

export class SourceChunkModel extends Model {}

const uuidPk = { type: DataTypes.CHAR(36), primaryKey: true, allowNull: false };

/** Registers models and associations; tables are created by Sequelize CLI migrations only. */
export function initModels(sequelize) {
  SchemeModel.init(
    {
      id: uuidPk,
      code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
    },
    { sequelize, tableName: 'schemes' },
  );
  SchemeVersionModel.init(
    {
      id: uuidPk,
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      status: { type: DataTypes.ENUM('draft', 'published', 'retired'), allowNull: false },
      ruleJson: { type: DataTypes.JSON, allowNull: false },
      checklistJson: { type: DataTypes.JSON, allowNull: false },
      notes: { type: DataTypes.TEXT, allowNull: true },
      verifiedOn: { type: DataTypes.DATEONLY, allowNull: true },
      verifiedBy: { type: DataTypes.STRING(64), allowNull: true },
      publishedAt: { type: DataTypes.DATE, allowNull: true },
    },
    { sequelize, tableName: 'scheme_versions' },
  );
  SourceDocumentModel.init(
    {
      id: uuidPk,
      title: { type: DataTypes.STRING(200), allowNull: false },
      section: { type: DataTypes.STRING(50), allowNull: true },
      url: { type: DataTypes.STRING(500), allowNull: true },
    },
    { sequelize, tableName: 'source_documents' },
  );
  SourceChunkModel.init(
    {
      id: uuidPk,
      chunkIndex: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      text: { type: DataTypes.TEXT, allowNull: false },
      embedding: { type: DataTypes.JSON, allowNull: true },
    },
    { sequelize, tableName: 'source_chunks' },
  );

  SchemeModel.hasMany(SchemeVersionModel, { foreignKey: 'schemeId', as: 'versions' });
  SchemeVersionModel.belongsTo(SchemeModel, { foreignKey: 'schemeId', as: 'scheme' });
  SchemeVersionModel.hasMany(SourceDocumentModel, { foreignKey: 'schemeVersionId' });
  SourceDocumentModel.hasMany(SourceChunkModel, { foreignKey: 'sourceDocumentId' });
}
