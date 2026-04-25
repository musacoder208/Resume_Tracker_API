import { Router } from 'express'
import type { Request, Response } from 'express'

export function authProxy(): Router {
  const router = Router()
  router.all('*', (_req: Request, res: Response) => {
    res.status(503).json({
      success: false,
      message: 'Auth service not available in microservice mode',
    })
  })
  return router
}
