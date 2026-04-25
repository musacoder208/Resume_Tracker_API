import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '@shared/config/env';
import { logger } from '@shared/logger/logger';
import type { ApiResponse } from '@shared/types/global.types';

export const globalRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  } satisfies ApiResponse,
  handler(req: Request, res: Response) {
    logger.warn('Global rate limit reached', { ip: req.ip, path: req.path });
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later',
    } satisfies ApiResponse);
  },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts, please try again later',
  } satisfies ApiResponse,
  handler(req: Request, res: Response) {
    logger.warn('Auth rate limit reached', { ip: req.ip, path: req.path });
    res.status(429).json({
      success: false,
      message: 'Too many login attempts, please try again later',
    } satisfies ApiResponse);
  },
});
