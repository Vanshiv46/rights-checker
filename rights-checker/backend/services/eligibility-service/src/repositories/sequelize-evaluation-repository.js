import { randomUUID } from 'node:crypto';
import { evaluationResultSchema } from '@rec/common';

import { EvaluationModel } from '../models/index.js';

const parseJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

function toStored(row) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    result: evaluationResultSchema.parse(parseJson(row.resultJson)),
    createdAt: row.createdAt,
  };
}

/** MySQL implementation of EvaluationRepository. */
export class SequelizeEvaluationRepository {
  constructor(sequelize) {
    this.sequelize = sequelize;
  }

  async replaceForSession(sessionId, results) {
    const rows = await this.sequelize.transaction(async (transaction) => {
      await EvaluationModel.destroy({ where: { sessionId }, transaction });
      return EvaluationModel.bulkCreate(
        results.map((result) => ({
          id: randomUUID(),
          sessionId,
          schemeVersionId: result.ruleVersion.id,
          schemeCode: result.schemeCode,
          verdict: result.verdict,
          firedRules: result.firedRules,
          missingFacts: result.missingFacts,
          resultJson: result,
        })),
        { transaction },
      );
    });
    return rows.map(toStored);
  }

  async findBySession(sessionId) {
    const rows = await EvaluationModel.findAll({
      where: { sessionId },
      attributes: ['id', 'sessionId', 'resultJson', 'createdAt'],
      order: [['schemeCode', 'ASC']],
    });
    return rows.map(toStored);
  }

  async deleteBySession(sessionId) {
    return EvaluationModel.destroy({ where: { sessionId } });
  }
}
