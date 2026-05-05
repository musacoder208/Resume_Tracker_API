import { Router } from 'express'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { validate } from '@shared/validators/validate'
import { answerJdSchema } from './schemas/jd.schema'
import { jdController } from './jd.controller'

const router = Router()

router.post('/start_id', authMiddleware, jdController.startId)
router.post('/questions_answer', authMiddleware, validate(answerJdSchema), jdController.questionsAnswer)

export default router
