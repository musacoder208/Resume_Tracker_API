import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '@shared/middleware/errorHandler';

type MiddlewareFn = (req: Request, res: Response, next: NextFunction) => void;

function createValidator(source: 'body' | 'query' | 'params', schema: ZodSchema): MiddlewareFn {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'Validation failed';
      return next(new AppError(message, 400, true));
    }
    req[source] = result.data;
    next();
  };
}

export function validate(schema: ZodSchema): MiddlewareFn {
  return createValidator('body', schema);
}

export function validateQuery(schema: ZodSchema): MiddlewareFn {
  return createValidator('query', schema);
}

export function validateParams(schema: ZodSchema): MiddlewareFn {
  return createValidator('params', schema);
}
