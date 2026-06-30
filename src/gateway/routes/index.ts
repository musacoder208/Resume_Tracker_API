import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { authAdapter } from '@gateway/adapters/auth.adapter'
import { commonAdapter } from '@gateway/adapters/common.adapter'
import { companyProfileAdapter } from '@gateway/adapters/companyProfile.adapter'
import { jdAdapter } from '@gateway/adapters/jd.adapter'
import { candidateAdapter } from '@gateway/adapters/candidate.adapter'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { pool } from '@shared/config/db'
import { sendSuccess } from '@shared/utils/response'
import type { RequestWithUser } from '@shared/types/global.types'

const router = Router()

router.get('/test', (_req, res) => {
  res.json({ message: 'gateway working' })
})

router.use('/auth', authAdapter)
router.use('/common', commonAdapter)
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

router.get('/dashboard/summary', authMiddleware, async (req: RequestWithUser, res, next) => {
  try {
    const result = await pool.query(
      'SELECT mechsoft.fn_get_dashboard_overview($1) AS overview',
      [req.tenantId]
    )

    const overview = (result.rows[0]?.overview ?? {}) as Record<string, unknown>
    const rawStats = (overview.stats ?? {}) as Record<string, number>
    const rawActivity = (overview.recent_activity ?? []) as Array<Record<string, unknown>>

    const stats = {
      totalJobs:        rawStats.total_jobs        ?? 0,
      totalCandidates:  rawStats.total_candidates  ?? 0,
      activeInterviews: rawStats.active_interviews ?? 0,
      hiredThisMonth:   rawStats.hired_this_month  ?? 0,
      pendingReviews:   rawStats.pending_reviews   ?? 0,
    }

    const recentActivity = rawActivity.map((event) => ({
      id:          uuidv4(),
      type:        event.type        as string,
      description: event.description as string,
      createdAt:   event.event_time  as string,
    }))

    sendSuccess(res, {
      code:    'DASHBOARD_SUMMARY_OK',
      message: 'Dashboard summary fetched successfully',
      data:    { stats, recentActivity },
    })
  } catch (error) {
    next(error)
  }
})

export default router
