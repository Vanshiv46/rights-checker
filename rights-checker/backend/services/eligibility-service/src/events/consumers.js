/**
 * rule.published  -> reload the rule cache (replay-safe: always loads the current published set)
 * session.deleted -> delete that session's evaluations (replay-safe: delete is idempotent)
 */
export function registerConsumers(bus, cache, eligibility) {
  bus.subscribe('rule.published', async () => {
    await cache.reload();
  });
  bus.subscribe('session.deleted', async (event) => {
    await eligibility.forgetSession(event.payload.sessionId);
  });
}
