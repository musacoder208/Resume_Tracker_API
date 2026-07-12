import { Response, NextFunction } from 'express'
import { RequestWithUser } from '@shared/types/global.types'
import { AppError } from '@shared/middleware/errorHandler'
import { sendSuccess } from '@shared/utils/response'
import { GetAllJdsDto } from './schemas/jd.schema'
import { jdService } from './services/jd.service'
import type { QANextQuestion, QADataBlob } from '@shared/types/qa.types'

// Per-user JD creation session state — keyed by userId
interface JdSessionState {
  sessionId: string
  jdId: number | null
  nextQuestion: QANextQuestion
  data: QADataBlob
  totalQuestionsCount: number | null
}

const jdSessionStore = new Map<number, JdSessionState>()

function clearJdSession(userId: number): void {
  jdSessionStore.delete(userId)
}

// Per-user QA edit session state — keyed by userId
interface JdEditSessionState {
  jdId: number
  updateContext: Record<string, unknown>
  step: string
}

const jdEditSessionStore = new Map<number, JdEditSessionState>()

function clearJdEditSession(userId: number): void {
  jdEditSessionStore.delete(userId)
}

export const jdController = {
  async startId(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const userId = req.userId!
      const jdId = req.body.jdId
      const dataBlob = req.body.dataBlob

      const { sessionId, nextQuestion, data, totalQuestionsCount } = await jdService.startJdSession(
        companyId,
        userId,
        jdId ? jdId : undefined,
        dataBlob
      )

      jdSessionStore.set(userId, {
        sessionId,
        jdId: jdId ?? null,
        nextQuestion,
        data,
        totalQuestionsCount: totalQuestionsCount ?? null,
      })

      sendSuccess(res, {
        code: 'JD_SESSION_STARTED',
        message: 'JD session started',
        data: {
          session_id: sessionId,
          next_question: nextQuestion,
          data_blob: data,
          total_questions_count: totalQuestionsCount,
        },
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async questionsAnswer(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!
      const session = jdSessionStore.get(userId)

      if (!session) {
        throw new AppError('No active JD session. Call POST /api/jd/start_id first.', 400)
      }

      const { answer, job_title_id, seniority_id } = req.body
      const companyId = req.tenantId!

      const result = await jdService.submitJdAnswer({
        answer,
        jobTitleId: job_title_id,
        seniorityId: seniority_id,
        companyId,
        userId,
        sessionId: session.sessionId,
        nextQuestion: session.nextQuestion,
        data: session.data,
        jdId: session.jdId,
        totalQuestionsCount: session.totalQuestionsCount,
      })

      if (result.isFinalized) {
        const finalizedJdId = result.jdId
        clearJdSession(userId)

        sendSuccess(res, {
          code: 'JD_COMPLETED',
          message: 'JD created successfully',
          data: { jd_id: finalizedJdId, next_question: null, data_blob: result.data, theory: result.theory ?? null },
          requestId: req.traceId,
        })
        return
      }

      // Update this user's session with the latest state
      jdSessionStore.set(userId, {
        ...session,
        jdId: result.jdId,
        nextQuestion: result.nextQuestion!,
        data: result.data!,
      })

      sendSuccess(res, {
        code: 'ANSWER_SUBMITTED',
        message: 'Answer submitted',
        data: {
          jd_id: result.jdId,
          next_question: result.nextQuestion,
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
      const { jd_id, user_command, field_values, current_weights, company_info, force_override, conversation_history } = req.body
      const userId = req.userId!

      const data = await jdService.updateWeightage({
        jdId: jd_id,
        userCommand: user_command,
        fieldValues: field_values,
        currentWeights: current_weights,
        companyInfo: company_info,
        forceOverride: force_override,
        conversationHistory: conversation_history,
        userId,
      })

      if (!data.success) {
        res.status(200).json({
          success: false,
          message: (data as Record<string, unknown> & { error?: { message?: string } }).error?.message ?? 'Failed to update JD weightage',
          data,
        })
        return
      }

      if (!data.weights_updated) {
        res.status(200).json({
          success: false,
          message: (data.response as string) ?? 'Weightage could not be updated based on your command',
          data,
        })
        return
      }

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
      const { job_title_id, seniority_id, status_id, page, page_size, sort_by, sort_order } = req.query as unknown as GetAllJdsDto

      const data = await jdService.getAllJDs({
        companyId,
        jobTitleId: job_title_id,
        seniorityId: seniority_id,
        statusId: status_id,
        page,
        pageSize: page_size,
        sortBy: sort_by,
        sortOrder: sort_order,
      })

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

      jdEditSessionStore.set(userId, {
        jdId: jd_id,
        updateContext: result.updateContext,
        step: result.step,
      })

      res.status(200).json({
        success: true,
        message: 'Edit QA session started',
        data: result.respondPayload,
      })
    } catch (error) {
      next(error)
    }
  },

  async updateWeightageConstraints(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jd_id, constraints } = req.body
      const userId = req.userId!

      const result = await jdService.updateWeightageConstraints({
        jdId: jd_id,
        constraints,
        userId,
      })

      res.status(200).json({
        success: result.updated,
        message: result.message,
        data: null,
      })
    } catch (error) {
      next(error)
    }
  },

  async publishJd(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jd_id } = req.body
      const userId = req.userId!

      const result = await jdService.publishJd({ jdId: jd_id, userId })

      res.status(200).json({
        success: result.published,
        message: result.message,
        data: null,
      })
    } catch (error) {
      next(error)
    }
  },

  async updateQa(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!
      const editSession = jdEditSessionStore.get(userId)

      if (!editSession) {
        throw new AppError('No active QA edit session. Call POST /api/jd/edit_qa first.', 400)
      }

      const { answer } = req.body

      const result = await jdService.updateQa({
        answer,
        userId,
        updateContext: editSession.updateContext,
        step: editSession.step,
        jdId: editSession.jdId,
      })

      if (result.isCompleted) {
        clearJdEditSession(userId)
        res.status(200).json({
          success: true,
          message: 'QA answer updated successfully',
          data: result.respondPayload,
        })
        return
      }

      jdEditSessionStore.set(userId, {
        ...editSession,
        updateContext: result.updateContext,
        step: result.step,
      })

      res.status(200).json({
        success: true,
        message: 'Answer submitted',
        data: result.respondPayload,
      })
    } catch (error) {
      next(error)
    }
  },

  async getJDDropdown(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const list = await jdService.getJDDropdown()

      sendSuccess(res, {
        code: 'JD_DROPDOWN_FETCHED',
        message: 'JD dropdown fetched successfully',
        data: list,
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },
}
