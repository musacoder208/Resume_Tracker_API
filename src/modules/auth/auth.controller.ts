import type { Response, NextFunction } from 'express'
import { authService } from './services/auth.service'
import { AppError } from '@shared/middleware/errorHandler'
import type { RequestWithUser } from '@shared/types/global.types'

export const authController = {
  async login(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.tenant?.companyId
      if (!companyId) {
        throw new AppError('Tenant not identified', 400)
      }
      const result = await authService.login(req.body, companyId)
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: result,
      })
    } catch (error) {
      next(error)
    }
  },

  async refreshToken(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.refreshToken(req.body.refreshToken as string)
      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: result,
      })
    } catch (error) {
      next(error)
    }
  },

  async logout(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId
      const tenantId = req.user?.tenantId
      if (!userId || !tenantId) {
        throw new AppError('Unauthorized', 401)
      }
      await authService.logout(req.body.refreshToken as string, userId, tenantId)
      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      })
    } catch (error) {
      next(error)
    }
  },

  async getAccess(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId
      const tenantId = req.user?.tenantId
      if (!userId || !tenantId) {
        throw new AppError('Unauthorized', 401)
      }
      const result = await authService.getAccess(userId, tenantId)
      res.status(200).json({
        success: true,
        message: 'Permissions fetched successfully',
        data: result,
      })
    } catch (error) {
      next(error)
    }
  },
}
