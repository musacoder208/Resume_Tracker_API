import type { Response, NextFunction } from 'express'
import type { RequestWithUser } from '@shared/types/global.types'
import { AppError } from '@shared/middleware/errorHandler'
import { companyProfileService } from './services/companyProfile.service'

export const companyProfileController = {
  async startProfile(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.startProfile(userId, tenantId)
      res.status(200).json({ success: true, message: 'Profile session started', data: result })
    } catch (error) {
      next(error)
    }
  },

  async submitAnswer(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.submitAnswer(req.body.answer as string, userId, tenantId)
      const message = result.completed ? 'Profile completed successfully' : 'Answer submitted'
      res.status(200).json({ success: true, message, data: result })
    } catch (error) {
      next(error)
    }
  },

  async getQAForEdit(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req
      if (!tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.getQAForEdit(tenantId)
      res.status(200).json({ success: true, message: 'Profile Q&A fetched', data: result })
    } catch (error) {
      next(error)
    }
  },

  async getProfileDetails(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req
      if (!tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.getProfileDetails(tenantId)
      res.status(200).json({ success: true, message: 'Profile details fetched', data: result })
    } catch (error) {
      next(error)
    }
  },

  async getProfileList(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req
      if (!tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.getProfileList(tenantId)
      res.status(200).json({ success: true, message: 'Profile list fetched', data: result })
    } catch (error) {
      next(error)
    }
  },

  async startUpdateField(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.startUpdateField(
        req.body.field_key as string,
        userId,
        tenantId
      )
      res.status(200).json({ success: true, message: 'Update session started', data: result })
    } catch (error) {
      next(error)
    }
  },

  async respondToUpdate(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.respondToUpdate(
        req.body.answer as string,
        userId,
        tenantId
      )
      const message = result.completed ? 'Field updated successfully' : 'Response submitted'
      res.status(200).json({ success: true, message, data: result })
    } catch (error) {
      next(error)
    }
  },

  async getMasterData(_req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await companyProfileService.getMasterData()
      res.status(200).json({ success: true, message: 'Master data fetched', data: result })
    } catch (error) {
      next(error)
    }
  },

  async getCompanyRegistration(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId } = req
      if (!tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.getCompanyRegistration(tenantId)
      res.status(200).json({ success: true, message: 'Company registration details fetched', data: result })
    } catch (error) {
      next(error)
    }
  },

  async updateCompanyRegistration(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.updateCompanyRegistration(tenantId, userId, req.body)
      res.status(200).json({ success: true, message: 'Company registration updated', data: result })
    } catch (error) {
      next(error)
    }
  },

  async deleteProfile(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, tenantId } = req
      if (!userId || !tenantId) throw new AppError('Unauthorized', 401)

      const result = await companyProfileService.deleteProfile(userId, tenantId)
      res.status(200).json({ success: true, message: 'Profile deleted successfully', data: result })
    } catch (error) {
      next(error)
    }
  },
}
