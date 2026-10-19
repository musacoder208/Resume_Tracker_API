import { Router } from 'express'
import { AppError } from '@shared/middleware/errorHandler'

export function reportsProxy(): Router {
  const router = Router()
  router.all('*', (_req, _res, next) => {
    next(new AppError('Reports service is not available in microservice mode', 503))
  })
  return router
}
