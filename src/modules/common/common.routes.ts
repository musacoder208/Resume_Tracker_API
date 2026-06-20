import { Router } from 'express'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { commonController } from './common.controller'

const router = Router()

router.use(authMiddleware)

router.get('/master-data', commonController.getMasterData)
router.get('/module-id', commonController.getModuleIdByCode)

export default router
