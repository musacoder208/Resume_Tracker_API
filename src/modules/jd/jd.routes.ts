import { Router } from 'express'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { validate, validateQuery } from '@shared/validators/validate'
import { answerJdSchema, getAllJdsSchema } from './schemas/jd.schema'
import { jdController } from './jd.controller'

const router = Router()

router.post('/start_id', authMiddleware, jdController.startId)
router.post('/questions_answer', authMiddleware, validate(answerJdSchema), jdController.questionsAnswer)
router.get('/getAllJDs', authMiddleware, validateQuery(getAllJdsSchema), jdController.getAllJDs)

export default router
