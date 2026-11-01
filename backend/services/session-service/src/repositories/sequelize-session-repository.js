import { randomUUID } from 'node:crypto';
import { factKeySchema, factValueSchema, HOUSEHOLD_SCOPE, languageSchema } from '@rec/common';
import { Op } from 'sequelize';
import { FactModel, HouseholdMemberModel, SessionModel } from '../models/index.js';

const parseJson = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

function toFactRecord(row) {
  return {
    memberId: row.memberId === HOUSEHOLD_SCOPE ? null : row.memberId,
    key: factKeySchema.parse(row.key),
    value: factValueSchema.parse(parseJson(row.value)),
    origin: row.origin,
    confidence: row.confidence,
    confirmed: row.confirmed,
  };
}

/** MySQL implementation of SessionRepository. */
export class SequelizeSessionRepository {
  constructor(sequelize) {
    this.sequelize = sequelize;
  }

  async create(session) {
    await SessionModel.create(session);
  }

  async findAggregate(id) {
    const row = await SessionModel.findByPk(id, {
      attributes: ['id', 'language', 'consentAt', 'expiresAt'],
      include: [
        { model: HouseholdMemberModel, as: 'members', attributes: ['id', 'ref', 'relation'] },
        {
          model: FactModel,
          as: 'facts',
          attributes: ['memberId', 'key', 'value', 'origin', 'confidence', 'confirmed'],
        },
      ],
      order: [[{ model: HouseholdMemberModel, as: 'members' }, 'createdAt', 'ASC']],
    });
    if (!row) return null;
    return {
      id: row.id,
      language: languageSchema.parse(row.language),
      consentAt: row.consentAt,
      expiresAt: row.expiresAt,
      members: (row.members ?? []).map((m) => ({ id: m.id, ref: m.ref, relation: m.relation })),
      facts: (row.facts ?? []).map(toFactRecord),
    };
  }

  async saveAnswers(sessionId, members, facts) {
    await this.sequelize.transaction(async (transaction) => {
      if (members.length > 0) {
        await HouseholdMemberModel.bulkCreate(
          members.map((m) => ({ ...m, sessionId })),
          { transaction },
        );
      }
      if (facts.length > 0) {
        await FactModel.bulkCreate(
          facts.map((f) => ({
            id: randomUUID(),
            sessionId,
            memberId: f.memberId ?? HOUSEHOLD_SCOPE,
            key: f.key,
            value: f.value,
            origin: f.origin,
            confidence: f.confidence,
            confirmed: f.confirmed,
          })),
          {
            transaction,
            updateOnDuplicate: ['value', 'origin', 'confidence', 'confirmed', 'updatedAt'],
          },
        );
      }
    });
  }

  async delete(id) {
    return (await SessionModel.destroy({ where: { id } })) > 0;
  }

  async findExpiredIds(now, limit) {
    const rows = await SessionModel.findAll({
      where: { expiresAt: { [Op.lt]: now } },
      attributes: ['id'],
      limit,
    });
    return rows.map((r) => r.id);
  }
}
