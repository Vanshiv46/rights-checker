import { Sequelize } from 'sequelize';

/**
 * TLS options for mysql2. With a CA (DB_SSL_CA, PEM; "\\n" escapes allowed) the server
 * certificate is verified; without one the connection is encrypted but not verified.
 * @param {{ DB_SSL: boolean, DB_SSL_CA?: string }} config
 */
export function mysqlSslOptions(config) {
  if (!config.DB_SSL) return undefined;
  const ca = config.DB_SSL_CA?.replace(/\\n/g, '\n');
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

/** Sequelize instance for MySQL 8.4 with a bounded pool; SQL text is never logged. */
export function createSequelize(config, logger) {
  const ssl = mysqlSslOptions(config);
  return new Sequelize(config.DB_NAME, config.DB_USER, config.DB_PASSWORD, {
    host: config.DB_HOST,
    port: config.DB_PORT,
    dialect: 'mysql',
    timezone: '+00:00',
    dialectOptions: { charset: 'utf8mb4', ...(ssl ? { ssl } : {}) },
    pool: { max: config.DB_POOL_MAX, min: 0, acquire: 10_000, idle: 10_000 },
    define: { underscored: true, timestamps: true },
    logging: (_sql, timing) => {
      logger.trace({ timingMs: timing }, 'sql executed');
    },
    benchmark: true,
  });
}

/** Readiness probe for a Sequelize connection. */
export async function databaseIsUp(sequelize) {
  try {
    await sequelize.authenticate();
    return true;
  } catch {
    return false;
  }
}
