import { Router } from 'express'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { validate, validateQuery, validateParams } from '@shared/validators/validate'
import {
  roundsQuerySchema,
  questionsQuerySchema,
  candidateIdParamsSchema,
  saveContactStatusSchema,
  saveRoundSchema,
} from './schemas/interviewProcess.schema'
import { interviewProcessController } from './interviewProcess.controller'

const router = Router()

router.use(authMiddleware)

router.get('/rounds', validateQuery(roundsQuerySchema), interviewProcessController.getRounds)
router.get('/interview-modes', interviewProcessController.getInterviewModes)
router.get('/interviewers', interviewProcessController.getInterviewers)
router.get('/contact-statuses', interviewProcessController.getContactStatuses)
router.get('/round-actions', interviewProcessController.getRoundActions)
router.get('/questions', validateQuery(questionsQuerySchema), interviewProcessController.getQuestions)

router.get(
  '/candidates/:candidateId/requisition',
  validateParams(candidateIdParamsSchema),
  interviewProcessController.getCandidateRequisition
)
router.get(
  '/candidates/:candidateId/history',
  validateParams(candidateIdParamsSchema),
  interviewProcessController.getCandidateHistory
)
router.post(
  '/candidates/:candidateId/contact-status',
  validateParams(candidateIdParamsSchema),
  validate(saveContactStatusSchema),
  interviewProcessController.saveContactStatus
)
router.post(
  '/candidates/:candidateId/rounds',
  validateParams(candidateIdParamsSchema),
  validate(saveRoundSchema),
  interviewProcessController.saveRound
)

export default router
