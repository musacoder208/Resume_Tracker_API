import { Router } from 'express'
import type { Response, NextFunction } from 'express'
import { validate } from '@shared/validators/validate'
import { authMiddleware } from '@shared/middleware/auth.middleware'
import { AppError } from '@shared/middleware/errorHandler'
import type { RequestWithUser } from '@shared/types/global.types'
import { companyProfileRepository } from './repositories/companyProfile.repository'
import { answerSchema, editQuestionSchema, updateAnswerSchema, updateRegistrationSchema } from './schemas/companyProfile.schema'
import { companyProfileController } from './companyProfile.controller'

const router = Router()

router.use(authMiddleware)

const requireAdmin = async (req: RequestWithUser, _res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.roleId || !req.tenantId) throw new AppError('Unauthorized', 401)
    const isAdmin = await companyProfileRepository.isAdminRole(req.roleId, req.tenantId)
    if (!isAdmin) throw new AppError('Admin access required', 403)
    next()
  } catch (error) {
    next(error)
  }
}

// Admin-only routes
router.get('/registration', requireAdmin, companyProfileController.getCompanyRegistration)
router.put('/registration', requireAdmin, validate(updateRegistrationSchema), companyProfileController.updateCompanyRegistration)
router.post('/start', requireAdmin, companyProfileController.startProfile)
router.post('/answer', requireAdmin, validate(answerSchema), companyProfileController.submitAnswer)
router.post('/edit_question', requireAdmin, validate(editQuestionSchema), companyProfileController.editQuestion)
router.post('/update_answer', requireAdmin, validate(updateAnswerSchema), companyProfileController.updateAnswer)
router.delete('/', requireAdmin, companyProfileController.deleteProfile)

// Read-only routes (all authenticated roles)
router.get('/qa-for-edit', companyProfileController.getQAForEdit)
router.get('/details', companyProfileController.getProfileDetails)
router.get('/list', companyProfileController.getProfileList)


export default router
