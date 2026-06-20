import type { Response, NextFunction } from 'express'
import type { RequestWithUser } from '@shared/types/global.types'
import { AppError } from '@shared/middleware/errorHandler'
import { sendSuccess } from '@shared/utils/response'
import { commonService } from '@shared/services/common.service'

export const commonController = {
  async getMasterData(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req
      if (!tenantId) throw new AppError('Unauthorized', 401)

      const result = await commonService.getMasterDataList(tenantId)
      sendSuccess(res, { code: 'MASTER_DATA_FETCHED', message: 'Master data fetched', data: result, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },

  async getModuleIdByCode(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req
      if (!userId) throw new AppError('Unauthorized', 401)

      const moduleCode = req.query.module_code as string | undefined
      if (!moduleCode || !moduleCode.trim()) throw new AppError('module_code is required', 400)

      const result = await commonService.getModuleIdByCode(moduleCode.trim())
      sendSuccess(res, { code: 'MODULE_ID_FETCHED', message: 'Module ID fetched', data: result, requestId: req.traceId })
    } catch (error) {
      next(error)
    }
  },
}
