import type { Response, NextFunction } from 'express'
import type { RequestWithUser } from '@shared/types/global.types'
import { AppError } from '@shared/middleware/errorHandler'
import { sendSuccess } from '@shared/utils/response'
import { companyProfileService } from './services/companyProfile.service'
import type { QANextQuestion, QADataBlob } from '@shared/types/qa.types'

// Main QA session state — one active profile creation session at a time
let tempSessionId: string | null = null
let tempNextQuestion: QANextQuestion | null = null
let tempData: QADataBlob | null = null
let tempTotalQuestionsCount: number | null = null

function clearTempState(): void {
  tempSessionId = null
  tempNextQuestion = null
  tempData = null
  tempTotalQuestionsCount = null
}

// Edit QA session state — one active edit session at a time
let tempEditUpdateContext: Record<string, unknown> | null = null
let tempEditStep: string | null = null

function clearEditTempState(): void {
  tempEditUpdateContext = null
  tempEditStep = null
}

export const companyProfileController = {
  async startProfile(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      const { sessionId, nextQuestion, data, theory, totalQuestionsCount } = await companyProfileService.startProfile(userId, tenantId)

      tempSessionId = sessionId
      tempNextQuestion = nextQuestion
      tempData = data
      tempTotalQuestionsCount = totalQuestionsCount

      sendSuccess(res, {
        code: 'PROFILE_SESSION_STARTED',
        message: 'Profile session started',
        data: {
          session_id: tempSessionId,
          next_question: tempNextQuestion,
          theory: theory ?? null,
          total_questions_count: tempTotalQuestionsCount,
          data_blob: data,
        },
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async submitAnswer(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      if (!tempSessionId || !tempNextQuestion || !tempData) {
        throw new AppError('No active profile session. Call POST /start first.', 400)
      }

      const result = await companyProfileService.submitAnswer({
        answer: req.body.answer as string,
        userId,
        tenantId,
        sessionId: tempSessionId,
        nextQuestion: tempNextQuestion,
        data: tempData,
        totalQuestionsCount: tempTotalQuestionsCount,
      })

      if (result.isCompleted) {
        clearTempState()
        sendSuccess(res, {
          code: 'PROFILE_COMPLETED',
          message: 'Profile completed successfully',
          data: {
            next_question: null,
            theory: result.theory ?? null,
            total_questions_count: tempTotalQuestionsCount,
          },
          requestId: req.traceId,
        })
        return
      }

      tempNextQuestion = result.nextQuestion!
      tempData = result.data!

      sendSuccess(res, {
        code: 'ANSWER_SUBMITTED',
        message: 'Answer submitted',
        data: {
          next_question: tempNextQuestion,
          theory: result.theory ?? null,
          total_questions_count: tempTotalQuestionsCount,
          data_blob: result.data,
        },
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async getQAForEdit(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req
      if (!tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.getQAForEdit(tenantId)
      sendSuccess(res, { code: 'PROFILE_QA_FETCHED', message: 'Profile Q&A fetched', data: result, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getProfileDetails(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req
      if (!tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.getProfileDetails(tenantId)
      sendSuccess(res, { code: 'PROFILE_DETAILS_FETCHED', message: 'Profile details fetched', data: result, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getProfileList(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req
      if (!tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.getProfileList(tenantId)
      sendSuccess(res, { code: 'PROFILE_LIST_FETCHED', message: 'Profile list fetched', data: result, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async editQuestion(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.editQuestion(
        req.body.field_key as string,
        req.body.answer as string,
        userId,
        tenantId
      )

      tempEditUpdateContext = result.update_context
      tempEditStep = result.step

      sendSuccess(res, { code: 'EDIT_INITIATED', message: 'Edit initiated', data: result, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async updateAnswer(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      if (!tempEditUpdateContext || !tempEditStep) {
        throw new AppError('No active edit session. Call /edit_question first.', 400)
      }

      const result = await companyProfileService.updateAnswer(
        req.body.answer as string,
        tempEditUpdateContext,
        tempEditStep,
        userId,
        tenantId
      )

      if (result.completed) {
        clearEditTempState()
      } else {
        tempEditUpdateContext = result.update_context as Record<string, unknown>
        tempEditStep = result.step as string
      }

      const code = result.completed ? 'ANSWER_UPDATED' : 'RESPONSE_SUBMITTED'
      const message = result.completed ? 'Answer updated successfully' : 'Response submitted'
      sendSuccess(res, { code, message, data: result, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getCompanyRegistration(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req
      if (!tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.getCompanyRegistration(tenantId)
      sendSuccess(res, { code: 'COMPANY_REGISTRATION_FETCHED', message: 'Company registration details fetched', data: result, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async updateCompanyRegistration(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.updateCompanyRegistration(tenantId, userId, req.body)
      sendSuccess(res, { code: 'COMPANY_REGISTRATION_UPDATED', message: 'Company registration updated', data: result, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async deleteProfile(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.deleteProfile(userId, tenantId)
      sendSuccess(res, { code: 'PROFILE_DELETED', message: 'Profile deleted successfully', data: result, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },
}
