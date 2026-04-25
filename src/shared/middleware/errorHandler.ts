import type { Request, Response, NextFunction } from 'express';
import { logger } from '@shared/logger/logger';
import { env } from '@shared/config/env';
import type { ApiResponse, RequestWithUser } from '@shared/types/global.types';

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

  const response: ApiResponse<null> = {
    success: false,
    message: err instanceof AppError && err.isOperational ? err.message : 'Internal Server Error',
    ...(traceId && { data: null, error: traceId }),
  };

  if (!isProduction && !(err instanceof AppError)) {
    (response as ApiResponse<null> & { stack?: string }).stack = err.stack;
  }

  res.status(statusCode).json(response);
}
