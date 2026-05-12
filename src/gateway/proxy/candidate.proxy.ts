import { Router } from 'express'
import type { Request, Response } from 'express'

export function candidateProxy(): Router {
  const router = Router()
  router.all('*', (_req: Request, res: Response) => {
    res.status(503).json({ error: 'Candidate service unavailable in microservice mode' })
  })
  return router
}
