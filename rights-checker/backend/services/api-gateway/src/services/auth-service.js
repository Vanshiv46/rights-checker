import { AppError, roleSchema } from '@rec/common';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { verifyPassword } from './password.js';

const claimsSchema = z.object({ sub: z.uuid(), role: roleSchema });

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

/** Operator login and JWT verification (HS256). */
export class AuthService {
  constructor(operators, audit, secret, expiresInSeconds) {
    this.operators = operators;
    this.audit = audit;
    this.secret = secret;
    this.expiresInSeconds = expiresInSeconds;
  }

  /** Checks credentials and issues a short-lived JWT; every success is audited. */
  async login(email, password, requestId) {
    const operator = await this.operators.findActiveByEmail(email);
    if (!operator || !(await verifyPassword(password, operator.passwordHash))) {
      throw invalidCredentials();
    }
    const token = jwt.sign({ role: operator.role }, this.secret, {
      algorithm: 'HS256',
      subject: operator.id,
      expiresIn: this.expiresInSeconds,
    });
    await this.audit.record({
      operatorId: operator.id,
      action: 'POST /v1/auth/login',
      resource: null,
      requestId,
      statusCode: 200,
    });
    return { token, role: operator.role, expiresIn: this.expiresInSeconds };
  }

  /** Verifies a bearer token; throws 401 when missing, expired or tampered. */
  verify(token) {
    try {
      const claims = claimsSchema.parse(jwt.verify(token, this.secret, { algorithms: ['HS256'] }));
      return { operatorId: claims.sub, role: claims.role };
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Token is missing, expired or invalid');
    }
  }
}
