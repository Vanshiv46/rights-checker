/** In-memory cache of published rule versions, filled from scheme-service. */
export class RuleCache {
  rules = [];
  loaded = false;

  constructor(schemes, logger) {
    this.schemes = schemes;
    this.logger = logger;
  }

  /** Replaces the cache with the current published rules (idempotent; safe on replayed events). */
  async reload() {
    this.rules = await this.schemes.listPublishedRules();
    this.loaded = true;
    this.logger.info(
      { schemes: this.rules.map((r) => `${r.schemeCode}@${r.version}`) },
      'rules loaded',
    );
  }

  /** Loads on first use when startup loading failed; throws 503 if scheme-service is down. */
  async ensureLoaded() {
    if (!this.loaded) await this.reload();
  }

  isLoaded() {
    return this.loaded;
  }

  list() {
    return this.rules;
  }
}
