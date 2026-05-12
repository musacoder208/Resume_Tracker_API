import { Router } from 'express'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { validate, validateQuery, validateParams } from '@shared/validators/validate'
import { answerJdSchema, getAllJdsSchema, jdByIdSchema, generateWeightageSchema, updateWeightageSchema, updateTheorySchema, editQaSchema, updateQaSchema } from './schemas/jd.schema'
import { jdController } from './jd.controller'

const router = Router()

router.post('/start_id', authMiddleware, jdController.startId)
router.post('/questions_answer', authMiddleware, validate(answerJdSchema), jdController.questionsAnswer)
router.post('/generateWeightage', authMiddleware, validate(generateWeightageSchema), jdController.generateWeightage)
router.put('/updateWeightage', authMiddleware, validate(updateWeightageSchema), jdController.updateWeightage)
router.get('/getAllJDs', authMiddleware, validateQuery(getAllJdsSchema), jdController.getAllJDs)
router.get('/getJdDetailsById/:jd_id', authMiddleware, validateParams(jdByIdSchema), jdController.getJdDetailsById)
router.post('/update_theory', authMiddleware, validate(updateTheorySchema), jdController.updateTheory)
router.post('/edit_qa', authMiddleware, validate(editQaSchema), jdController.editQa)
router.post('/update_qa', authMiddleware, validate(updateQaSchema), jdController.updateQa)

export default router
