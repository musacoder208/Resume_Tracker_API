import { Response, NextFunction } from 'express'
import { RequestWithUser } from '@shared/types/global.types'
import { AppError } from '@shared/middleware/errorHandler'
import { GetAllJdsDto } from './schemas/jd.schema'
import { jdService } from './services/jd.service'

// Module-level session state — one active JD creation session at a time
let tempSessionId: string | null = null
let tempJdId: number | null = null
let tempQuestionId: string | null = null
let tempQuestionText: string | null = null
let tempFieldKey: string | null = null
let tempType: string | null = null
let tempMode: string | null = null
let tempCanBeSkipped: boolean | null = null
let tempAllowedValues: string[] | null = null

function clearTempState(): void {
  tempSessionId = null
  tempJdId = null
  tempQuestionId = null
  tempQuestionText = null
  tempFieldKey = null
  tempType = null
  tempMode = null
  tempCanBeSkipped = null
  tempAllowedValues = null
}

// Edit QA session state — one active QA edit session at a time
let tempEditJdId: number | null = null
let tempEditUpdateContext: Record<string, unknown> | null = null
let tempEditStep: string | null = null

function clearEditTempState(): void {
  tempEditJdId = null
  tempEditUpdateContext = null
  tempEditStep = null
}

export const jdController = {
  async startId(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const userId = req.userId!

      const { sessionId, question } = await jdService.startJdSession(companyId, userId)

      tempSessionId = sessionId
      tempJdId = null
      tempQuestionId = question.question_id
      tempQuestionText = question.question_text
      tempFieldKey = question.field_key
      tempType = question.type
      tempMode = question.mode
      tempCanBeSkipped = question.can_be_skipped
      tempAllowedValues = question.allowed_values

      res.status(200).json({
        success: true,
        message: 'JD session started',
        data: {
          session_id: tempSessionId,
          question: {
            question_id: tempQuestionId,
            question_text: tempQuestionText,
            field_key: tempFieldKey,
            type: tempType,
            mode: tempMode,
            can_be_skipped: tempCanBeSkipped,
            allowed_values: tempAllowedValues,
          },
        },
      })
    } catch (error) {
      next(error)
    }
  },

  async questionsAnswer(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!tempSessionId || !tempQuestionId || !tempFieldKey || !tempQuestionText || !tempType) {
        throw new AppError('No active JD session. Call POST /api/jd/start_id first.', 400)
      }

      const { answer, job_title_id, seniority_id } = req.body
      const companyId = req.tenantId!
      const userId = req.userId!

      const result = await jdService.submitJdAnswer({
        answer,
        jobTitleId: job_title_id,
        seniorityId: seniority_id,
        companyId,
        userId,
        sessionId: tempSessionId,
        questionId: tempQuestionId,
        questionText: tempQuestionText,
        fieldKey: tempFieldKey,
        type: tempType,
        jdId: tempJdId,
        mode: tempMode,
      })

      tempJdId = result.jdId

      if (result.isFinalized) {
        const finalizedJdId = result.jdId
        clearTempState()

        res.status(200).json({
          success: true,
          message: 'JD created successfully',
          data: { jd_id: finalizedJdId },
        })
        return
      }

      const nextQuestion = result.nextQuestion!
      tempQuestionId = nextQuestion.question_id
      tempQuestionText = nextQuestion.question_text
      tempFieldKey = nextQuestion.field_key
      tempType = nextQuestion.type
      tempMode = nextQuestion.mode
      tempCanBeSkipped = nextQuestion.can_be_skipped
      tempAllowedValues = nextQuestion.allowed_values

      res.status(200).json({
        success: true,
        message: 'Answer recorded',
        data: {
          question: {
            question_id: tempQuestionId,
            question_text: tempQuestionText,
            field_key: tempFieldKey,
            type: tempType,
            mode: tempMode,
            can_be_skipped: tempCanBeSkipped,
            allowed_values: tempAllowedValues,
          },
        },
      })
    } catch (error) {
      next(error)
    }
  },

  async updateWeightage(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jd_id, user_command } = req.body
      const companyId = req.tenantId!
      const userId = req.userId!

      const data = await jdService.updateWeightage({
        jdId: jd_id,
        userCommand: user_command,
        companyId,
        userId,
      })

      res.status(200).json({
        success: true,
        message: 'JD weightage updated successfully',
        data,
      })
    } catch (error) {
      next(error)
    }
  },

  async generateWeightage(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jd_id, additional_notes } = req.body
      const companyId = req.tenantId!
      const userId = req.userId!

      const data = await jdService.generateWeightage({
        jdId: jd_id,
        additionalNotes: additional_notes ?? '',
        companyId,
        userId,
      })

      res.status(200).json({
        success: true,
        message: 'JD weightage generated successfully',
        data,
      })
    } catch (error) {
      next(error)
    }
  },

  async getJdDetailsById(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const jdId = Number(req.params.jd_id)
      const data = await jdService.getJdDetailsById(jdId)

      res.status(200).json({
        success: true,
        message: 'JD details fetched successfully',
        data,
      })
    } catch (error) {
      next(error)
    }
  },

  async getAllJDs(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const { job_title_id, seniority_id } = req.query as unknown as GetAllJdsDto

      const data = await jdService.getAllJDs(companyId, job_title_id, seniority_id)

      res.status(200).json({
        success: true,
        message: 'JD list fetched successfully',
        data,
      })
    } catch (error) {
      next(error)
    }
  },

  async updateTheory(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jd_id, edit_command } = req.body
      const userId = req.userId!

      const data = await jdService.updateTheory({
        jdId: jd_id,
        editCommand: edit_command,
        userId,
      })

      res.status(200).json({
        success: true,
        message: 'JD theory updated successfully',
        data,
      })
    } catch (error) {
      next(error)
    }
  },

  async editQa(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jd_id, field_key, answer } = req.body
      const companyId = req.tenantId!
      const userId = req.userId!

      const result = await jdService.editQa({
        jdId: jd_id,
        fieldKey: field_key,
        answer,
        companyId,
        userId,
      })

      tempEditJdId = jd_id
      tempEditUpdateContext = result.updateContext
      tempEditStep = result.step

      res.status(200).json({
        success: true,
        message: 'Edit QA session started',
        data: result.respondPayload,
      })
    } catch (error) {
      next(error)
    }
  },

  async updateQa(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!tempEditJdId || !tempEditUpdateContext || !tempEditStep) {
        throw new AppError('No active QA edit session. Call POST /api/jd/edit_qa first.', 400)
      }

      const { answer } = req.body
      const userId = req.userId!

      const result = await jdService.updateQa({
        answer,
        userId,
        updateContext: tempEditUpdateContext,
        step: tempEditStep,
        jdId: tempEditJdId,
      })

      if (result.isCompleted) {
        clearEditTempState()
        res.status(200).json({
          success: true,
          message: 'QA answer updated successfully',
          data: result.respondPayload,
        })
        return
      }

      tempEditUpdateContext = result.updateContext
      tempEditStep = result.step

      res.status(200).json({
        success: true,
        message: 'Answer recorded',
        data: result.respondPayload,
      })
    } catch (error) {
      next(error)
    }
  },
}
