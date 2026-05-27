import type { Request, Response, NextFunction } from 'express';
import { logger } from '@shared/logger/logger';
import { env } from '@shared/config/env';
import { sendError } from '@shared/utils/response';
import type { RequestWithUser } from '@shared/types/global.types';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const traceId = (req as RequestWithUser).traceId;
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const isProduction = env.NODE_ENV === 'production';

  logger.error(err.message, {
    statusCode,
    traceId,
    stack: isProduction ? undefined : err.stack,
    path: req.path,
    method: req.method,
  });

  const message =
    err instanceof AppError && err.isOperational ? err.message : 'Internal Server Error';

  const code =
    err instanceof AppError && err.isOperational ? 'ERROR' : 'INTERNAL_SERVER_ERROR';

  sendError(res, { code, message, statusCode, requestId: traceId });
}
