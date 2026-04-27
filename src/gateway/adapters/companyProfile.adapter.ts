import { Router } from 'express'
import { env } from '@shared/config/env'
import { safeLoad } from '@gateway/utils/safeLoad'
import { companyProfileProxy } from '@gateway/proxy/companyProfile.proxy'

const router = Router()
router.use('/', env.MODE === 'monolith' ? safeLoad('companyProfile') : companyProfileProxy())

export const companyProfileAdapter = router
