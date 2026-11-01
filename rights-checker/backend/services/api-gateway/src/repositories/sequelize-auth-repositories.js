import { randomUUID } from 'node:crypto';
import { AuditLogModel, OperatorModel } from '../models/index.js';

/** MySQL implementation of OperatorRepository. */
export class SequelizeOperatorRepository {
  async findActiveByEmail(email) {
    const row = await OperatorModel.findOne({
      where: { email: email.toLowerCase(), active: true },
      attributes: ['id', 'passwordHash', 'role'],
    });
    return row ? { id: row.id, passwordHash: row.passwordHash, role: row.role } : null;
  }
}

/** MySQL implementation of AuditRepository. */
export class SequelizeAuditRepository {
  async record(entry) {
    await AuditLogModel.create({ id: randomUUID(), ...entry });
  }
}
