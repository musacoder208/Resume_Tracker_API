import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { env } from '@shared/config/env';
import { logger } from '@shared/logger/logger';

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.connect()
  .then((client: PoolClient) => {
    logger.info('Database connected successfully');
    client.release();
  })
  .catch((err: Error) => {
    logger.error('Database connection error', { error: err.message });
    process.exit(1);
  });
