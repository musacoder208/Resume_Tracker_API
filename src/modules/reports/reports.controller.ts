import { Response, NextFunction } from 'express'
import { RequestWithUser } from '@shared/types/global.types'
import { sendSuccess } from '@shared/utils/response'
import { reportsService } from './services/reports.service'
import type {
  AiUsageJdsQueryDto,
  AiUsageJdProcessesQueryDto,
  AiUsageJdCandidatesQueryDto,
} from './schemas/reports.schema'

export const reportsController = {
  // Excel download — the only report endpoint that returns a file instead of
  // the ApiResponse JSON; errors still go through next(error) as JSON.
  async exportAiUsage(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const userId = req.userId!
      const query = req.query as unknown as AiUsageJdsQueryDto
      const { buffer, fileName } = await reportsService.exportAiUsage(companyId, userId, query)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
      res.status(200).send(buffer)
    } catch (error) {
      next(error)
    }
  },

  async getAiUsageJdDropdown(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const data = await reportsService.getAiUsageJdDropdown(companyId)
      sendSuccess(res, { code: 'AI_USAGE_JD_DROPDOWN_FETCHED', message: 'AI usage JD list fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getAiUsageJds(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const query = req.query as unknown as AiUsageJdsQueryDto
      const data = await reportsService.getAiUsageJds(companyId, query)
      sendSuccess(res, { code: 'AI_USAGE_JDS_FETCHED', message: 'AI usage by JD fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getAiUsageJdProcesses(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const query = req.query as unknown as AiUsageJdProcessesQueryDto
      const data = await reportsService.getAiUsageJdProcesses(companyId, query)
      sendSuccess(res, { code: 'AI_USAGE_JD_PROCESSES_FETCHED', message: 'AI usage processes fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getAiUsageJdCandidates(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenantId!
      const query = req.query as unknown as AiUsageJdCandidatesQueryDto
      const data = await reportsService.getAiUsageJdCandidates(companyId, query)
      sendSuccess(res, { code: 'AI_USAGE_JD_CANDIDATES_FETCHED', message: 'AI usage candidates fetched successfully', data, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },
}
