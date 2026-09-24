import { Response, NextFunction } from 'express'
import { RequestWithUser } from '@shared/types/global.types'
import { sendSuccess } from '@shared/utils/response'
import { interviewProcessService } from './services/interviewProcess.service'
import type { QuestionsQueryDto, SaveContactStatusDto, SaveRoundDto } from './schemas/interviewProcess.schema'

export const interviewProcessController = {
  async getRounds(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const data = await interviewProcessService.getRounds(companyId)
      sendSuccess(res, { code: 'IP_ROUNDS_FETCHED', message: 'Rounds fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getInterviewModes(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await interviewProcessService.getInterviewModes()
      sendSuccess(res, { code: 'IP_INTERVIEW_MODES_FETCHED', message: 'Interview modes fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getInterviewers(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await interviewProcessService.getInterviewers()
      sendSuccess(res, { code: 'IP_INTERVIEWERS_FETCHED', message: 'Interviewers fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getContactStatuses(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await interviewProcessService.getContactStatuses()
      sendSuccess(res, { code: 'IP_CONTACT_STATUSES_FETCHED', message: 'Contact statuses fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getRoundActions(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await interviewProcessService.getRoundActions()
      sendSuccess(res, { code: 'IP_ROUND_ACTIONS_FETCHED', message: 'Round actions fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getQuestions(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const { jdId, seniorityId, roundId, actionId } = req.query as unknown as QuestionsQueryDto

      const data = await interviewProcessService.getQuestions({ companyId, jdId, seniorityId, roundId, actionId })
      sendSuccess(res, { code: 'IP_QUESTIONS_FETCHED', message: 'Questions fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getCandidateRequisition(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const candidateId = Number(req.params.candidateId)

      const data = await interviewProcessService.getCandidateRequisition(candidateId, companyId)
      sendSuccess(res, { code: 'IP_CANDIDATE_REQUISITION_FETCHED', message: 'Candidate requisition fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getCandidateHistory(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const candidateId = Number(req.params.candidateId)

      const data = await interviewProcessService.getCandidateHistory(candidateId, companyId)
      sendSuccess(res, { code: 'IP_CANDIDATE_HISTORY_FETCHED', message: 'Candidate interview history fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async saveContactStatus(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const userId = req.userId!
      const candidateId = Number(req.params.candidateId)
      const dto = req.body as SaveContactStatusDto

      const data = await interviewProcessService.saveContactStatus(candidateId, companyId, userId, dto)
      sendSuccess(res, { code: 'IP_CONTACT_STATUS_SAVED', message: 'Contact status saved successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async saveRound(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const userId = req.userId!
      const candidateId = Number(req.params.candidateId)
      const dto = req.body as SaveRoundDto

      const data = await interviewProcessService.saveRound(candidateId, companyId, userId, dto)
      sendSuccess(res, { code: 'IP_ROUND_SAVED', message: 'Round decision saved successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },
}
