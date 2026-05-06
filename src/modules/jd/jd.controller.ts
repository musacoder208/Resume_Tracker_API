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

  async getAllJDs(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { company_id, job_title_id, seniority_id } = req.query as unknown as GetAllJdsDto

      const data = await jdService.getAllJDs(company_id, job_title_id, seniority_id)

      res.status(200).json({
        success: true,
        message: 'JD list fetched successfully',
        data,
      })
    } catch (error) {
      next(error)
    }
  },
}
