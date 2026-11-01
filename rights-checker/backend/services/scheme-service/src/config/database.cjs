// Sequelize CLI configuration. Reads the same env vars as the service (see .env.example).
const path = require('node:path');

try {
  process.loadEnvFile(path.join(__dirname, '../../.env'));
} catch {
  // no .env file: rely on the real environment
}

// Same TLS rule as @rec/common mysqlSslOptions (DB_SSL=true for cloud MySQL such as Aiven).
const caPem = process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, '\n') : undefined;
const ssl =
  process.env.DB_SSL === 'true'
    ? caPem
      ? { ca: caPem, rejectUnauthorized: true }
      : { rejectUnauthorized: false }
    : undefined;

const config = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  dialect: 'mysql',
  timezone: '+00:00',
  define: { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' },
  migrationStorageTableName: 'sequelize_meta',
  seederStorage: 'sequelize',
  seederStorageTableName: 'sequelize_data',
  dialectOptions: ssl ? { ssl } : {},
  logging: false,
};

module.exports = { development: config, test: config, production: config };
