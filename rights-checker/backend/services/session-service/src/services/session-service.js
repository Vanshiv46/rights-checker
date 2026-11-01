import { randomUUID } from 'node:crypto';
import {
  AppError,
  buildEvent,
  currentRequestId,
  Errors,
  factScope,
  isFactKey,
  isValidFactValue,
} from '@rec/common';

const EXPIRY_BATCH = 100;

function toDto(session) {
  return {
    id: session.id,
    language: session.language,
    consentAt: session.consentAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
}

/** Machine-only member lookup: existing member ids plus refs (existing or new). */
class MemberDirectory {
  byRef = new Map();
  ids = new Set();

  constructor(existing) {
    for (const m of existing) {
      this.ids.add(m.id);
      if (m.ref) this.byRef.set(m.ref, m.id);
    }
  }

  add(member) {
    if (member.ref && this.byRef.has(member.ref)) {
      throw Errors.unprocessable(
        'DUPLICATE_MEMBER_REF',
        `Member ref "${member.ref}" already exists`,
      );
    }
    this.ids.add(member.id);
    if (member.ref) this.byRef.set(member.ref, member.id);
  }

  resolve(answer) {
    const id = answer.memberId ?? (answer.memberRef ? this.byRef.get(answer.memberRef) : undefined);
    if (!id || !this.ids.has(id)) {
      throw Errors.unprocessable('UNKNOWN_MEMBER', `Answer for ${answer.key} needs a known member`);
    }
    return id;
  }
}

function toFactRecord(answer, members) {
  const { key, value } = answer;
  if (!isFactKey(key)) throw Errors.unprocessable('UNKNOWN_FACT', `Unknown fact "${key}"`);
  if (!isValidFactValue(key, value)) {
    throw Errors.unprocessable('INVALID_FACT_VALUE', `Invalid value for "${key}"`);
  }
  const isHousehold = factScope(key) === 'household';
  if (isHousehold && (answer.memberId ?? answer.memberRef)) {
    throw Errors.unprocessable('UNEXPECTED_MEMBER', `"${key}" is a household fact`);
  }
  const origin = answer.origin ?? 'typed';
  return {
    memberId: isHousehold ? null : members.resolve(answer),
    key,
    value,
    origin,
    confidence: answer.confidence ?? (origin === 'typed' ? 1 : null),
    // Typed answers are confirmed by the citizen; voice/OCR facts need an explicit confirmation.
    confirmed: answer.confirmed ?? origin === 'typed',
  };
}

/** Keeps the last answer for each (member, key) pair. */
function latestPerKey(facts) {
  return [...new Map(facts.map((f) => [`${f.memberId ?? ''}|${f.key}`, f])).values()];
}

/** Sessions, consent, household members and answers. */
export class SessionService {
  constructor(repo, bus, logger, ttlHours) {
    this.repo = repo;
    this.bus = bus;
    this.logger = logger;
    this.ttlHours = ttlHours;
  }

  /** Starts a session; consent is mandatory (422 without it). */
  async create(body) {
    if (!body.consent) {
      throw Errors.unprocessable('CONSENT_REQUIRED', 'Consent is required to start a session');
    }
    const now = new Date();
    const session = {
      id: randomUUID(),
      language: body.language,
      consentAt: now,
      expiresAt: new Date(now.getTime() + this.ttlHours * 3600_000),
    };
    await this.repo.create(session);
    return toDto(session);
  }

  /** Session summary with its members (no fact values). */
  async get(id) {
    const session = await this.load(id);
    return { ...toDto(session), members: session.members };
  }

  /** Adds members and saves typed/voice/OCR answers after validating them against the catalogue. */
  async saveAnswers(id, body) {
    const session = await this.load(id);
    const directory = new MemberDirectory(session.members);
    const newMembers = (body.members ?? []).map((m) => ({
      id: randomUUID(),
      ref: m.ref,
      relation: m.relation,
    }));
    newMembers.forEach((m) => {
      directory.add(m);
    });
    const facts = latestPerKey(body.answers.map((a) => toFactRecord(a, directory)));
    await this.repo.saveAnswers(id, newMembers, facts);
    return { sessionId: id, members: [...session.members, ...newMembers], saved: facts.length };
  }

  /** Confirmed facts shaped for the rules engine; unconfirmed ones are listed, not used. */
  async getFacts(id) {
    const session = await this.load(id);
    const confirmed = session.facts.filter((f) => f.confirmed);
    const memberFacts = (memberId) =>
      Object.fromEntries(
        confirmed.filter((f) => f.memberId === memberId).map((f) => [f.key, f.value]),
      );
    return {
      sessionId: session.id,
      language: session.language,
      household: Object.fromEntries(
        confirmed.filter((f) => f.memberId === null).map((f) => [f.key, f.value]),
      ),
      members: session.members.map((m) => ({
        id: m.id,
        relation: m.relation,
        facts: memberFacts(m.id),
      })),
      unconfirmed: session.facts
        .filter((f) => !f.confirmed)
        .map((f) => ({ key: f.key, memberId: f.memberId })),
    };
  }

  /** Erases a session. The event goes out first so evaluations are never orphaned. */
  async delete(id, reason = 'user_request') {
    const exists = await this.repo.findAggregate(id);
    if (!exists) throw Errors.notFound('Session');
    await this.bus.publish(
      buildEvent('session.deleted', { sessionId: id, reason }, currentRequestId()),
    );
    await this.repo.delete(id);
  }

  /** Background job: erases sessions past expires_at. Returns how many were removed. */
  async expireSessions(now) {
    const ids = await this.repo.findExpiredIds(now, EXPIRY_BATCH);
    for (const id of ids) await this.delete(id, 'expired');
    if (ids.length > 0) this.logger.info({ count: ids.length }, 'expired sessions erased');
    return ids.length;
  }

  async load(id) {
    const session = await this.repo.findAggregate(id);
    if (!session) throw Errors.notFound('Session');
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new AppError(404, 'SESSION_EXPIRED', 'Session has expired');
    }
    return session;
  }
}
