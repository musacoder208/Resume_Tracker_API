import { Router } from 'express'
import { AppError } from '@shared/middleware/errorHandler'

export function chatAssistantProxy(): Router {
  const router = Router()
  router.all('*', (_req, _res, next) => {
    next(new AppError('Chat Assistant service is not available in microservice mode', 503))
  })
  return router
}
