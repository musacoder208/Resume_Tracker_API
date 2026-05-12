import { Router } from 'express'
import { env } from '@shared/config/env'
import { safeLoad } from '@gateway/utils/safeLoad'
import { candidateProxy } from '@gateway/proxy/candidate.proxy'

const router = Router()
router.use('/', env.MODE === 'monolith' ? safeLoad('candidate') : candidateProxy())

export const candidateAdapter = router
