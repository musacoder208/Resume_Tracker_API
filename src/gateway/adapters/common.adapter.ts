import { Router } from 'express'
import { env } from '@shared/config/env'
import { safeLoad } from '@gateway/utils/safeLoad'

const router = Router()
router.use('/', safeLoad('common'))

export const commonAdapter = router
