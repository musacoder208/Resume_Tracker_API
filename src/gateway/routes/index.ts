import { Router } from 'express'
import { authAdapter } from '@gateway/adapters/auth.adapter'
import { companyProfileAdapter } from '@gateway/adapters/companyProfile.adapter'
import { jdAdapter } from '@gateway/adapters/jd.adapter'
import { candidateAdapter } from '@gateway/adapters/candidate.adapter'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { pool } from '@shared/config/db'
import type { RequestWithUser } from '@shared/types/global.types'

const router = Router()

router.get('/test', (_req, res) => {
  res.json({ message: 'gateway working' })
})

router.use('/auth', authAdapter)
router.use('/companyProfile', companyProfileAdapter)
router.use('/jd', jdAdapter)
router.use('/candidate', candidateAdapter)

router.get('/dashboard/overview', authMiddleware, async (req: RequestWithUser, res, next) => {
  try {
    const result = await pool.query(
      'SELECT mechsoft.fn_get_dashboard_overview($1) AS overview',
      [req.tenantId]
    )
    res.status(200).json({
      success: true,
      message: 'Dashboard overview fetched successfully',
      data: result.rows[0]?.overview ?? {},
    })
  } catch (error) {
    next(error)
  }
})

export default router
