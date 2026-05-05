import { Router } from 'express'
import { AppError } from '@shared/middleware/errorHandler'

export function jdProxy(): Router {
  const router = Router()
  router.all('*', (_req, _res, next) => {
    next(new AppError('JD service is not available in microservice mode', 503))
  })
  return router
}
