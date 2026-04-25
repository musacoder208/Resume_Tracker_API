import { Router } from 'express'
import { validate } from '@shared/validators/validate'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { loginSchema, refreshTokenSchema } from './schemas/auth.schema'
import { authController } from './auth.controller'

const router = Router()

router.post('/login', validate(loginSchema), authController.login)
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken)
router.get('/access', authMiddleware, authController.getAccess)

export default router
