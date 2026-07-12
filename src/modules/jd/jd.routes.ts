import { Router } from 'express'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { validate, validateQuery, validateParams } from '@shared/validators/validate'
import { answerJdSchema, getAllJdsSchema, jdByIdSchema, generateWeightageSchema, updateWeightageSchema, updateTheorySchema, editQaSchema, updateQaSchema, publishJdSchema, updateWeightageConstraintsSchema } from './schemas/jd.schema'
import { jdController } from './jd.controller'

const router = Router()

router.use(authMiddleware)

router.post('/start_jd', jdController.startId)
router.post('/questions_answer', validate(answerJdSchema), jdController.questionsAnswer)
router.post('/generateWeightage', validate(generateWeightageSchema), jdController.generateWeightage)
router.put('/updateWeightage', validate(updateWeightageSchema), jdController.updateWeightage)
router.get('/getAllJDs', validateQuery(getAllJdsSchema), jdController.getAllJDs)
router.get('/getJdDetailsById/:jd_id', validateParams(jdByIdSchema), jdController.getJdDetailsById)
router.delete('/deleteJd/:jd_id', validateParams(jdByIdSchema), jdController.deleteJd)
router.post('/update_theory', validate(updateTheorySchema), jdController.updateTheory)
router.post('/edit_qa', validate(editQaSchema), jdController.editQa)
router.post('/update_qa', validate(updateQaSchema), jdController.updateQa)
router.put('/publishJd', validate(publishJdSchema), jdController.publishJd)
router.put('/updateWeightageConstraints', validate(updateWeightageConstraintsSchema), jdController.updateWeightageConstraints)
router.get('/getJDDropdown', jdController.getJDDropdown)

export default router
