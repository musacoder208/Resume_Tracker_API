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
}
