import { Router } from 'express'
import { validate } from '@shared/validators/validate'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { loginSchema, refreshTokenSchema, logoutSchema } from './schemas/auth.schema'
import { authController } from './auth.controller'

const router = Router()

router.post('/login', validate(loginSchema), authController.login)
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken)
router.post('/logout', authMiddleware, validate(logoutSchema), authController.logout)
router.get('/access', authMiddleware, authController.getAccess)

export default router
