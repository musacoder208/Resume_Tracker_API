import { Router } from 'express'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { validateQuery } from '@shared/validators/validate'
import {
  aiUsageJdsQuerySchema,
  aiUsageJdProcessesQuerySchema,
  aiUsageJdCandidatesQuerySchema,
} from './schemas/reports.schema'
import { reportsController } from './reports.controller'

const router = Router()

router.use(authMiddleware)

router.get('/ai-usage/jd-dropdown', reportsController.getAiUsageJdDropdown)
router.get('/ai-usage/export', validateQuery(aiUsageJdsQuerySchema), reportsController.exportAiUsage)
router.get('/ai-usage/jds', validateQuery(aiUsageJdsQuerySchema), reportsController.getAiUsageJds)
router.get('/ai-usage/jd-processes', validateQuery(aiUsageJdProcessesQuerySchema), reportsController.getAiUsageJdProcesses)
router.get('/ai-usage/jd-candidates', validateQuery(aiUsageJdCandidatesQuerySchema), reportsController.getAiUsageJdCandidates)

export default router
