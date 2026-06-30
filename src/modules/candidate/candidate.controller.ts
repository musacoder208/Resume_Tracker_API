import type { Response, NextFunction } from 'express'
import type { RequestWithUser } from '@shared/types/global.types'
import { AppError } from '@shared/middleware/errorHandler'
import { sendSuccess } from '@shared/utils/response'
import { candidateService } from './services/candidate.service'
import logger from '@shared/logger/logger'
import type { SaveCandidatesDto, UpdateCandidateScoreDto, SaveCandidateFeedbackDto, SaveHRFeedbackDto, GetCandidateListDto } from './schemas/candidate.schema'

export const candidateController = {
  async uploadResumes(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const positionTitle = req.body?.position_title as string | undefined
      if (!positionTitle || !positionTitle.trim()) {
        throw new AppError('position_title is required', 400)
      }

      const files = req.files as Express.Multer.File[] | undefined
      if (!files || files.length === 0) {
        throw new AppError('No files uploaded', 400)
      }

      const result = await candidateService.uploadResumes(files, positionTitle.trim())

      sendSuccess(res, {
        code: 'RESUMES_UPLOADED',
        message: result.status === 'partial' ? 'Some files are invalid' : 'Resumes extracted successfully',
        data: result,
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async uploadResumesStream(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const positionTitle = req.body?.position_title as string | undefined
      if (!positionTitle || !positionTitle.trim()) throw new AppError('position_title is required', 400)

      const jdId = parseInt(req.body?.jd_id as string, 10)
      if (isNaN(jdId) || jdId <= 0) throw new AppError('jd_id is required', 400)

      const orgId = req.tenantId
      if (!orgId) throw new AppError('Unauthorized', 401)

      const files = req.files as Express.Multer.File[] | undefined
      if (!files || files.length === 0) throw new AppError('No files uploaded', 400)

      // Fire and forget — Python handles extraction + saving in background
      candidateService.uploadResumesStream(files, positionTitle.trim(), jdId, orgId, userId)
        .catch((err) => logger.error('Resume upload stream error', { err }))

      sendSuccess(res, {
        code: 'UPLOAD_STARTED',
        message: 'Resumes uploaded. Processing started in background.',
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async getUploadStatus(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const jdId = parseInt(req.query?.jd_id as string, 10)
      if (isNaN(jdId) || jdId <= 0) throw new AppError('jd_id is required', 400)

      const data = await candidateService.getUploadStatus(jdId)

      sendSuccess(res, {
        code: 'UPLOAD_STATUS_FETCHED',
        message: 'Upload status fetched successfully',
        data,
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async selectCandidateFiles(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const positionTitle = req.body?.position_title as string | undefined
      if (!positionTitle || !positionTitle.trim()) {
        throw new AppError('position_title is required', 400)
      }

      const files = req.files as Express.Multer.File[] | undefined
      if (!files || files.length === 0) {
        throw new AppError('No files uploaded', 400)
      }

      const result = await candidateService.selectCandidateFiles(files, positionTitle.trim())

      sendSuccess(res, {
        code: 'CANDIDATE_FILES_SELECTED',
        message: 'Candidate files extracted successfully',
        data: result,
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async saveCandidates(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const { jd_id, candidates } = req.body as SaveCandidatesDto

      const { savedCount, candidateIds } = await candidateService.saveCandidates(
        jd_id,
        userId,
        candidates as Record<string, unknown>[]
      )

      sendSuccess(res, {
        code: 'CANDIDATES_SAVED',
        message: 'Candidates saved successfully',
        data: {
          status: 'success',
          saved_count: savedCount,
          candidate_ids: candidateIds,
        },
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async getCandidateDetailsById(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const candidateId = parseInt(req.params.id as string, 10)
      if (isNaN(candidateId) || candidateId <= 0) {
        throw new AppError('Invalid candidate ID', 400)
      }

      const data = await candidateService.getCandidateDetailsById(candidateId)

      sendSuccess(res, {
        code: 'CANDIDATE_DETAILS_FETCHED',
        message: 'Candidate details fetched successfully',
        data,
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async getFeedbackTypes(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const list = await candidateService.getFeedbackTypes()

      sendSuccess(res, {
        code: 'FEEDBACK_TYPES_FETCHED',
        message: 'Feedback types fetched successfully',
        data: list,
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async saveHRFeedback(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const { candidate_id, feedbacks } = req.body as SaveHRFeedbackDto

      await candidateService.saveUpdateHRFeedback({
        candidateId: candidate_id,
        feedbacks: feedbacks.map((f) => ({
          groupScoreId:    f.group_score_id,
          feedbackTypeId:  f.feedback_type_id,
          userFeedback:    f.user_feedback,
        })),
        createdBy: userId,
      })

      sendSuccess(res, {
        code: 'HR_FEEDBACK_SAVED',
        message: 'HR feedback saved successfully',
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async saveCandidateFeedback(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const { candidate_id, feedback_type_id, user_feedback } = req.body as SaveCandidateFeedbackDto

      await candidateService.saveCandidateFeedback({
        candidateId:    candidate_id,
        feedbackTypeId: feedback_type_id,
        userFeedback:   user_feedback,
        createdBy:      userId,
      })

      sendSuccess(res, {
        code: 'FEEDBACK_SAVED',
        message: 'Feedback saved successfully',
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async getCandidateList(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const { jd_id, search_text, verdict, experience_range, status_id, page, page_size } = req.query as unknown as GetCandidateListDto

      const { summary, candidates, totalCount, totalPages } = await candidateService.getCandidateList({
        jdId:             jd_id,
        searchText:       search_text,
        verdict:          verdict,
        experienceRange:  experience_range,
        statusId:         status_id,
        page:             page ?? 1,
        pageSize:         page_size ?? 20,
      })

      sendSuccess(res, {
        code: 'CANDIDATE_LIST_FETCHED',
        message: 'Candidate list fetched successfully',
        data: {
          summary,
          candidates,
          pagination: {
            total_count: totalCount,
            page:        page ?? 1,
            page_size:   page_size ?? 20,
            total_pages: totalPages,
          },
        },
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },

  async updateCandidateScore(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const { jd_id, candidate_ids } = req.body as UpdateCandidateScoreDto

      const result = await candidateService.updateCandidateScore(jd_id, candidate_ids, userId)

      sendSuccess(res, {
        code: 'CANDIDATE_SCORES_UPDATED',
        message: 'Candidate scores updated successfully',
        data: { total_scored: result.totalScored },
        requestId: req.traceId,
      })
    } catch (error) {
      next(error)
    }
  },
}
