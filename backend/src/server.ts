import { buildApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';

async function main() {
  const app = buildApp();

  try {
    await pool.query('SELECT 1');
    app.log.info('Connected to PostgreSQL');
  } catch (err) {
    app.log.error(err, 'Failed to connect to PostgreSQL - check .env PGHOST/PGUSER/PGPASSWORD/PGDATABASE');
    process.exit(1);
  }

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
    app.log.info(`LMS backend listening on http://localhost:${env.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
