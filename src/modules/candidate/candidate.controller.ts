import type { Response, NextFunction } from 'express'
import type { RequestWithUser } from '@shared/types/global.types'
import { AppError } from '@shared/middleware/errorHandler'
import { candidateService } from './services/candidate.service'
import type { SaveCandidatesDto, UpdateCandidateScoreDto, SaveCandidateFeedbackDto } from './schemas/candidate.schema'

export const candidateController = {
  async uploadResumes(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const positionTitle = req.body?.position_title as string | undefined
      if (!positionTitle || !positionTitle.trim()) {
        throw new AppError('position_title is required', 400)
      }

      const files = req.files as Express.Multer.File[] | undefined
      if (!files || files.length === 0) {
        throw new AppError('No files uploaded', 400)
      }

      const result = await candidateService.uploadResumes(files, positionTitle.trim())

      res.status(200).json({
        success: true,
        message: result.status === 'partial' ? 'Some files are invalid' : 'Resumes extracted successfully',
        data: result,
      })
    } catch (error) {
      next(error)
    }
  },

  async selectCandidateFiles(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const positionTitle = req.body?.position_title as string | undefined
      if (!positionTitle || !positionTitle.trim()) {
        throw new AppError('position_title is required', 400)
      }

      const files = req.files as Express.Multer.File[] | undefined
      if (!files || files.length === 0) {
        throw new AppError('No files uploaded', 400)
      }

      const result = await candidateService.selectCandidateFiles(files, positionTitle.trim())

      res.status(200).json({
        success: true,
        message: 'Candidate files extracted successfully',
        data: result,
      })
    } catch (error) {
      next(error)
    }
  },

  async saveCandidates(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jd_id, created_by, candidates } = req.body as SaveCandidatesDto

      const { savedCount } = await candidateService.saveCandidates(
        jd_id,
        created_by,
        candidates as Record<string, unknown>[]
      )

      res.status(200).json({
        success: true,
        message: 'Candidates saved successfully',
        data: {
          status: 'success',
          saved_count: savedCount,
          message: 'Candidates saved successfully',
        },
      })
    } catch (error) {
      next(error)
    }
  },

  async getCandidateDetailsById(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const candidateId = parseInt(req.params.id as string, 10)
      if (isNaN(candidateId) || candidateId <= 0) {
        throw new AppError('Invalid candidate ID', 400)
      }

      const data = await candidateService.getCandidateDetailsById(candidateId)

      res.status(200).json({
        success: true,
        message: 'Candidate details fetched successfully',
        data,
      })
    } catch (error) {
      next(error)
    }
  },

  async getFeedbackTypes(_req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const list = await candidateService.getFeedbackTypes()

      res.status(200).json({
        success: true,
        message: 'Feedback types fetched successfully',
        data: list,
      })
    } catch (error) {
      next(error)
    }
  },

  async saveCandidateFeedback(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { candidate_id, feedback_type_id, user_feedback, created_by } = req.body as SaveCandidateFeedbackDto

      await candidateService.saveCandidateFeedback({
        candidateId:    candidate_id,
        feedbackTypeId: feedback_type_id,
        userFeedback:   user_feedback,
        createdBy:      created_by,
      })

      res.status(200).json({
        success: true,
        message: 'Feedback saved successfully',
      })
    } catch (error) {
      next(error)
    }
  },

  async getJDDropdown(_req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const list = await candidateService.getJDDropdown()

      res.status(200).json({
        success: true,
        message: 'JD dropdown fetched successfully',
        data: list,
      })
    } catch (error) {
      next(error)
    }
  },

  async updateCandidateScore(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jd_id, created_by } = req.body as UpdateCandidateScoreDto

      const result = await candidateService.updateCandidateScore(jd_id, created_by)

      res.status(200).json({
        success: true,
        message: 'Candidate scores updated successfully',
        data: { total_scored: result.totalScored },
      })
    } catch (error) {
      next(error)
    }
  },
}
