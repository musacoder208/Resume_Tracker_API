import { Router } from 'express'
import type { Request, Response } from 'express'

export const companyProfileProxy = (): Router => {
  const router = Router()
  router.all('*', (_req: Request, res: Response) => {
    res.status(503).json({ success: false, message: 'Company Profile service unavailable' })
  })
  return router
}
