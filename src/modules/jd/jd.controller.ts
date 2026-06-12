import { Response, NextFunction } from 'express'
import { RequestWithUser } from '@shared/types/global.types'
import { AppError } from '@shared/middleware/errorHandler'
import { sendSuccess } from '@shared/utils/response'
import { GetAllJdsDto } from './schemas/jd.schema'
import { jdService } from './services/jd.service'
import type { QANextQuestion, QADataBlob } from '@shared/types/qa.types'

// Module-level session state — one active JD creation session at a time
let tempSessionId: string | null = null
let tempJdId: number | null = null
let tempNextQuestion: QANextQuestion | null = null
let tempData: QADataBlob | null = null

function clearTempState(): void {
  tempSessionId = null
  tempJdId = null
  tempNextQuestion = null
  tempData = null
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
      const  jdId  = req.body.jdId
      const dataBlob  = req.body.dataBlob

      const { sessionId, nextQuestion, data } = await jdService.startJdSession(
        companyId,
        userId,
        jdId ? jdId  : undefined,
        dataBlob
      )

      tempSessionId = sessionId
      tempJdId = jdId ?? null
      tempNextQuestion = nextQuestion
      tempData = data

      sendSuccess(res, {
        code: 'JD_SESSION_STARTED',
        message: 'JD session started',
        data: {
          session_id: tempSessionId,
          next_question: tempNextQuestion,
          data_blob: data,
        },
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async questionsAnswer(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!tempSessionId || !tempNextQuestion || !tempData) {
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
        nextQuestion: tempNextQuestion,
        data: tempData,
        jdId: tempJdId,
      })

      tempJdId = result.jdId

      if (result.isFinalized) {
        const finalizedJdId = result.jdId
        clearTempState()

        sendSuccess(res, {
          code: 'JD_COMPLETED',
          message: 'JD created successfully',
          data: { jd_id: finalizedJdId, next_question: null, data_blob: result.data, theory: result.theory ?? null },
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
          jd_id: tempJdId,
          next_question: tempNextQuestion,
          data_blob: result.data,
        },
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async updateWeightage(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jd_id, user_command, field_values, current_weights, company_info } = req.body
      const userId = req.userId!

      const data = await jdService.updateWeightage({
        jdId: jd_id,
        userCommand: user_command,
        fieldValues: field_values,
        currentWeights: current_weights,
        companyInfo: company_info,
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

      sendSuccess(res, {
        code: 'JD_DETAILS_FETCHED',
        message: 'JD details fetched successfully',
        data,
        requestId: req.traceId,
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

  async deleteJd(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const jdId = Number(req.params.jd_id)
      const userId = req.userId!

      const result = await jdService.deleteJd({ jdId, userId })

      res.status(200).json({
        success: result.deleted,
        message: result.message,
        data: null,
      })
    } catch (error) {
      next(error)
    }
  },

  async updateTheory(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jd_id, edit_command, field_values, rendered_text } = req.body
      const userId = req.userId!

      const data = await jdService.updateTheory({
        jdId: jd_id,
        editCommand: edit_command,
        fieldValues: field_values,
        renderedText: rendered_text,
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
      const { jd_id, field_key, answer, field_values, field_progress } = req.body
      const companyId = req.tenantId!
      const userId = req.userId!

      const result = await jdService.editQa({
        jdId: jd_id,
        fieldKey: field_key,
        answer,
        fieldValues: field_values,
        fieldProgress: field_progress,
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
        message: 'Answer submitted',
        data: result.respondPayload,
      })
    } catch (error) {
      next(error)
    }
  },
}
