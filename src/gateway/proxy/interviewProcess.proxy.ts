import { Router } from 'express'
import { AppError } from '@shared/middleware/errorHandler'

export function interviewProcessProxy(): Router {
  const router = Router()
  router.all('*', (_req, _res, next) => {
    next(new AppError('Interview Process service is not available in microservice mode', 503))
  })
  return router
}
