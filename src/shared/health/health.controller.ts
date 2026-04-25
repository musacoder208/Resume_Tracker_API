import type { Request, Response } from 'express';
import { db } from '@shared/config/db';
import { logger } from '@shared/logger/logger';
import { env } from '@shared/config/env';
import type { ApiResponse } from '@shared/types/global.types';

interface HealthData {
  status: 'healthy';
  timestamp: string;
  database: 'connected' | 'disconnected';
  uptime: number;
  environment: string;
}

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';

  try {
    await db.query('SELECT 1');
    dbStatus = 'connected';
  } catch (err) {
    logger.warn('Health check: database unreachable', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  const data: HealthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    uptime: process.uptime(),
    environment: env.NODE_ENV,
  };

  logger.info('Health check', { database: dbStatus, uptime: data.uptime });

  const response: ApiResponse<HealthData> = {
    success: true,
    message: 'API is healthy',
    data,
  };

  res.status(200).json(response);
}
