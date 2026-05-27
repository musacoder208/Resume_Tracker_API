import { Router } from 'express'
import { validate } from '@shared/validators/validate'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { loginSchema } from './schemas/auth.schema'
import { authController } from './auth.controller'

const router = Router()

router.post('/login', validate(loginSchema), authController.login)
router.get('/session', authController.session)
router.post('/logout', authMiddleware, authController.logout)
router.get('/access', authMiddleware, authController.getAccess)

export default router
