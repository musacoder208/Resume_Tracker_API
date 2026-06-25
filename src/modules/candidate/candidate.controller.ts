import type { Response, NextFunction } from 'express'
import type { RequestWithUser } from '@shared/types/global.types'
import { AppError } from '@shared/middleware/errorHandler'
import { sendSuccess } from '@shared/utils/response'
import { candidateService } from './services/candidate.service'
import type { SaveCandidatesDto, UpdateCandidateScoreDto, SaveCandidateFeedbackDto, GetCandidateListDto } from './schemas/candidate.schema'

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

      const files = req.files as Express.Multer.File[] | undefined
      if (!files || files.length === 0) throw new AppError('No files uploaded', 400)

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()

      const push = (data: Record<string, unknown>) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      }

      await candidateService.uploadResumesStream(files, positionTitle.trim(), jdId, userId, push)

      res.write('data: [DONE]\n\n')
      res.end()
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

      const { jd_id, search_text, verdict, experience_range, page, page_size } = req.query as unknown as GetCandidateListDto

      const { summary, candidates, totalCount, totalPages } = await candidateService.getCandidateList({
        jdId:             jd_id,
        searchText:       search_text,
        verdict:          verdict,
        experienceRange:  experience_range,
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

  async getJDDropdown(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId
      if (!userId) throw new AppError('Unauthorized', 401)

      const list = await candidateService.getJDDropdown()

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
