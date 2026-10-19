import { Router } from 'express'
import { env } from '@shared/config/env'
import { safeLoad } from '@gateway/utils/safeLoad'
import { reportsProxy } from '@gateway/proxy/reports.proxy'

const router = Router()
router.use('/', env.MODE === 'monolith' ? safeLoad('reports') : reportsProxy())

export const reportsAdapter = router
