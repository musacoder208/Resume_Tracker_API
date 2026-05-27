import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@shared/config/env';
import { logger } from '@shared/logger/logger';
import { AppError } from '@shared/middleware/errorHandler';
import type { RequestWithUser, AuthPayload } from '@shared/types/global.types';

export function authMiddleware(req: RequestWithUser, _res: Response, next: NextFunction): void {
  try {
    const token = req.cookies?.accessToken as string | undefined;

    if (!token) {
      logger.warn('Auth failed: accessToken cookie missing', {
        traceId: req.traceId,
        path: req.path,
      });
      throw new AppError('Access token is required', 401);
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;

    req.user = decoded;
    req.userId = decoded.userId;
    req.tenantId = decoded.tenantId;
    req.roleId = decoded.roleId;

    next();
  } catch (err) {
    if (err instanceof AppError) {
      return next(err);
    }

    logger.warn('Auth failed: invalid or expired token', {
      traceId: req.traceId,
      path: req.path,
      error: err instanceof Error ? err.message : 'Unknown error',
    });

    next(new AppError('Invalid or expired token', 401));
  }
}
