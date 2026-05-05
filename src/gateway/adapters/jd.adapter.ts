import { Router } from 'express'
import { env } from '@shared/config/env'
import { safeLoad } from '@gateway/utils/safeLoad'
import { jdProxy } from '@gateway/proxy/jd.proxy'

const router = Router()
router.use('/', env.MODE === 'monolith' ? safeLoad('jd') : jdProxy())

export const jdAdapter = router
