import { buildEvent, currentRequestId, AppError } from '@rec/common';
import { evaluate } from '../engine/evaluate.js';
import { planQuestions } from '../engine/planner.js';

/** Orchestrates evaluation: facts from session-service, rules from the cache, pure engine, storage. */
export class EligibilityService {
  constructor(cache, sessions, repo, bus, logger) {
    this.cache = cache;
    this.sessions = sessions;
    this.repo = repo;
    this.bus = bus;
    this.logger = logger;
  }

  /** Evaluates every published scheme for a session, stores the verdicts and emits evaluation.created. */
  async evaluateSession(sessionId) {
    await this.cache.ensureLoaded();
    const facts = await this.sessions.getFacts(sessionId);
    const rules = this.cache.list();
    const results = rules.map((rule) => evaluate(rule, facts));
    const stored = await this.repo.replaceForSession(sessionId, results);
    await this.announce(
      sessionId,
      stored.map((s) => s.id),
      results,
    );
    return {
      sessionId,
      evaluatedAt: (stored[0]?.createdAt ?? new Date()).toISOString(),
      results,
      nextQuestions: planQuestions(rules, facts, facts.language),
    };
  }

  /** Last stored verdicts for a session (404 when it was never evaluated). */
  async getResults(sessionId) {
    const stored = await this.repo.findBySession(sessionId);
    const first = stored[0];
    if (!first) throw new AppError(404, 'NO_EVALUATION', 'This session has not been evaluated yet');
    return {
      sessionId,
      evaluatedAt: first.createdAt.toISOString(),
      results: stored.map((s) => s.result),
      nextQuestions: [],
    };
  }

  /** session.deleted handler: removes a session's evaluations (idempotent). */
  async forgetSession(sessionId) {
    const removed = await this.repo.deleteBySession(sessionId);
    this.logger.info({ removed }, 'evaluations erased for deleted session');
  }

  async announce(sessionId, evaluationIds, results) {
    const verdicts = Object.fromEntries(results.map((r) => [r.schemeCode, r.verdict]));
    try {
      await this.bus.publish(
        buildEvent(
          'evaluation.created',
          { sessionId, evaluationIds, verdicts },
          currentRequestId(),
        ),
      );
    } catch (err) {
      // Verdicts are already stored; a broken event bus must not hide them from the citizen.
      this.logger.warn({ err }, 'evaluation.created could not be published');
    }
  }
}
