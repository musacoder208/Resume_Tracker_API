import { Router } from 'express'
import { env } from '@shared/config/env'
import { safeLoad } from '@gateway/utils/safeLoad'
import { interviewProcessProxy } from '@gateway/proxy/interviewProcess.proxy'

const router = Router()
router.use('/', env.MODE === 'monolith' ? safeLoad('interviewProcess') : interviewProcessProxy())

export const interviewProcessAdapter = router
