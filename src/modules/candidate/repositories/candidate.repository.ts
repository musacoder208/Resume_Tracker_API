import { pool } from '@shared/config/db'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

export const candidateRepository = {
  async checkDuplicate(fullName: string, email: string, phone: string): Promise<boolean> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_check_candidate_duplicate($1, $2, $3) AS is_duplicate',
        [fullName, email, phone]
      )
      const isDuplicate = result.rows[0]?.is_duplicate === true
      logger.info('Duplicate check', { fullName, email, phone, isDuplicate, raw: result.rows[0] })
      return isDuplicate
    } catch (error) {
      logger.error('DB error in checkDuplicate', { error })
      throw new AppError('Database error', 500)
    }
  },

  async saveCandidateDetails(params: {
    jdId: number
    fullName: string
    email: string
    phone: string
    location: string | null
    linkedinUrl: string | null
    githubUrl: string | null
    portfolioLinks: string[] | null
    currentJobTitle: string | null
    currentCompany: string | null
    totalExperience: number | null
    resumeFileName: string | null
    resumeFilePath: string | null
    rawAiResponse: object
    education: object[]
    experience: object[]
    technicalSkills: string[]
    coreSkills: string[]
    softSkills: string[]
    createdBy: number
    uploadStatus?: string | null
    reason?: string | null
  }): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT mechsoft.add_update_candidate_details(
          $1, $2, $3, $4, $5, $6, $7, $8::text[],
          $9, $10, $11, $12, $13, $14::jsonb,
          $15::jsonb, $16::jsonb, $17::text[], $18::text[], $19::text[], $20,
          $21, $22
        ) AS candidate_id`,
        [
          params.jdId,
          params.fullName,
          params.email,
          params.phone,
          params.location,
          params.linkedinUrl,
          params.githubUrl,
          params.portfolioLinks ?? [],
          params.currentJobTitle,
          params.currentCompany,
          params.totalExperience,
          params.resumeFileName,
          params.resumeFilePath,
          JSON.stringify(params.rawAiResponse),
          JSON.stringify(params.education),
          JSON.stringify(params.experience),
          params.technicalSkills,
          params.coreSkills,
          params.softSkills,
          params.createdBy,
          params.uploadStatus ?? null,
          params.reason ?? null,
        ]
      )
      return result.rows[0]?.candidate_id as number
    } catch (error) {
      const e = error as { message?: string; detail?: string; hint?: string; code?: string }
      logger.error('DB error in saveCandidateDetails', {
        message: e.message,
        detail: e.detail,
        hint: e.hint,
        code: e.code,
      })
      throw new AppError('Database error', 500)
    }
  },

  async getUploadStatus(jdId: number): Promise<{
    complete: Record<string, unknown>[]
    duplicate: Record<string, unknown>[]
    incomplete: Record<string, unknown>[]
  }> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_upload_status_by_jd($1) AS data',
        [jdId]
      )
      return result.rows[0]?.data ?? { complete: [], duplicate: [], incomplete: [] }
    } catch (error) {
      logger.error('DB error in getUploadStatus', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getJDWeightage(jdId: number): Promise<Record<string, unknown> | null> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_jd_weightage($1) AS weightage_json',
        [jdId]
      )
      return (result.rows[0]?.weightage_json as Record<string, unknown>) ?? null
    } catch (error) {
      logger.error('DB error in getJDWeightage', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getCandidateList(params: {
    jdId?: number
    searchText?: string
    verdict?: string
    experienceRange?: string
    statusId?: number
    page: number
    pageSize: number
  }): Promise<{ summary: Record<string, unknown>; totalCount: number; candidates: Record<string, unknown>[] }> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_candidate_list($1, $2, $3, $4, $5, $6, $7) AS result',
        [
          params.jdId            ?? null,
          params.searchText      ?? null,
          params.verdict         ?? null,
          params.experienceRange ?? null,
          params.page,
          params.pageSize,
          params.statusId        ?? null,
        ]
      )
      const raw = result.rows[0]?.result as Record<string, unknown> ?? {}
      return {
        summary:    (raw.summary    as Record<string, unknown>) ?? {},
        totalCount: (raw.total_count as number) ?? 0,
        candidates: Array.isArray(raw.candidates) ? (raw.candidates as Record<string, unknown>[]) : [],
      }
    } catch (error) {
      logger.error('DB error in getCandidateList', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getCandidatesForScoring(jdId: number, candidateIds: number[]): Promise<Record<string, unknown>[]> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_candidates_for_scoring($1, $2::bigint[]) AS candidates',
        [jdId, candidateIds]
      )
      const candidates = result.rows[0]?.candidates
      return Array.isArray(candidates) ? candidates : []
    } catch (error) {
      logger.error('DB error in getCandidatesForScoring', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getCandidatesByIds(jdId: number, candidateIds: number[]): Promise<Record<string, unknown>[]> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_candidates_by_ids($1, $2::int[]) AS candidates',
        [jdId, candidateIds]
      )
      const candidates = result.rows[0]?.candidates
      return Array.isArray(candidates) ? candidates : []
    } catch (error) {
      logger.error('DB error in getCandidatesByIds', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getFeedbackTypes(): Promise<Array<{ feedback_type_id: number; feedback_type: string }>> {
    try {
      const result = await pool.query('SELECT * FROM mechsoft.fn_get_feedback_types()')
      return result.rows
    } catch (error) {
      logger.error('DB error in getFeedbackTypes', { error })
      throw new AppError('Database error', 500)
    }
  },

  async saveUpdateHRFeedback(params: {
    candidateId: number
    feedbacks: Array<{ groupScoreId: number; feedbackTypeId: number; userFeedback: string }>
    createdBy: number
  }): Promise<void> {
    try {
      const feedbacksJson = JSON.stringify(
        params.feedbacks.map((f) => ({
          group_score_id:   f.groupScoreId,
          feedback_type_id: f.feedbackTypeId,
          user_feedback:    f.userFeedback,
        }))
      )
      await pool.query(
        'SELECT mechsoft.fn_save_update_hr_feedback($1, $2::jsonb, $3)',
        [params.candidateId, feedbacksJson, params.createdBy]
      )
    } catch (error) {
      const e = error as { message?: string; detail?: string; hint?: string; code?: string }
      logger.error('DB error in saveUpdateHRFeedback', {
        message: e.message,
        detail: e.detail,
        hint: e.hint,
        code: e.code,
      })
      throw new AppError('Database error', 500)
    }
  },

  async saveCandidateFeedback(params: {
    candidateId: number
    feedbackTypeId: number
    userFeedback: string
    createdBy: number
  }): Promise<void> {
    try {
      await pool.query(
        'SELECT mechsoft.fn_save_candidate_feedback($1, $2, $3, $4)',
        [params.candidateId, params.feedbackTypeId, params.userFeedback, params.createdBy]
      )
    } catch (error) {
      const e = error as { message?: string; detail?: string; hint?: string; code?: string }
      logger.error('DB error in saveCandidateFeedback', {
        message: e.message,
        detail: e.detail,
        hint: e.hint,
        code: e.code,
      })
      throw new AppError('Database error', 500)
    }
  },

  async updateCandidateDetails(params: {
    candidateId:     number
    email:           string
    phone:           string
    totalExperience: number
    modifiedBy:      number
  }): Promise<boolean> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_update_candidate_details($1, $2, $3, $4, $5) AS updated',
        [params.candidateId, params.email, params.phone, params.totalExperience, params.modifiedBy]
      )
      return result.rows[0]?.updated === true
    } catch (error) {
      const e = error as { message?: string; detail?: string; code?: string }
      logger.error('DB error in updateCandidateDetails', { message: e.message, detail: e.detail, code: e.code })
      throw new AppError('Database error', 500)
    }
  },

  async saveHRAnswers(params: {
    candidateId: number
    answers: Array<{ questionKey: string; answerText: string }>
    createdBy: number
  }): Promise<void> {
    try {
      const answersJson = JSON.stringify(
        params.answers.map((a) => ({
          question_key: a.questionKey,
          answer_text:  a.answerText,
        }))
      )
      await pool.query(
        'SELECT mechsoft.fn_save_hr_answers($1, $2::jsonb, $3)',
        [params.candidateId, answersJson, params.createdBy]
      )
    } catch (error) {
      const e = error as { message?: string; detail?: string; code?: string }
      logger.error('DB error in saveHRAnswers', { message: e.message, detail: e.detail, code: e.code })
      throw new AppError('Database error', 500)
    }
  },

  async getHRAnswers(candidateId: number, companyId: number): Promise<Record<string, unknown>[]> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_hr_answers($1, $2) AS data',
        [candidateId, companyId]
      )
      const data = result.rows[0]?.data
      return Array.isArray(data) ? data : []
    } catch (error) {
      logger.error('DB error in getHRAnswers', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getHRQuestions(companyId: number): Promise<Record<string, unknown>[]> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_hr_questions($1) AS data',
        [companyId]
      )
      const data = result.rows[0]?.data
      return Array.isArray(data) ? data : []
    } catch (error) {
      logger.error('DB error in getHRQuestions', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getResumeFilePath(candidateId: number): Promise<{ filePath: string; fileName: string } | null> {
    try {
      const result = await pool.query(
        `SELECT resume_file_path, resume_file_name
         FROM mechsoft.tbl_candidates_header
         WHERE candidate_id = $1 AND is_deleted = FALSE`,
        [candidateId]
      )
      const row = result.rows[0]
      if (!row || !row.resume_file_path) return null
      return { filePath: row.resume_file_path as string, fileName: row.resume_file_name as string }
    } catch (error) {
      logger.error('DB error in getResumeFilePath', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getCandidateDetailsById(candidateId: number): Promise<Record<string, unknown> | null> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_candidate_details_by_id($1) AS details',
        [candidateId]
      )
      return (result.rows[0]?.details as Record<string, unknown>) ?? null
    } catch (error) {
      const e = error as { message?: string; detail?: string; hint?: string; code?: string }
      logger.error('DB error in getCandidateDetailsById', {
        message: e.message,
        detail: e.detail,
        hint: e.hint,
        code: e.code,
      })
      throw new AppError('Database error', 500)
    }
  },

  async saveCandidateScore(params: {
    candidateId: number
    baseScore: number
    finalScore: number
    verdict: string
    scoreJson: object
    groupBreakdown: Record<string, unknown>
    createdBy: number
  }): Promise<void> {
    try {
      await pool.query(
        `SELECT mechsoft.fn_add_update_candidate_score(
          $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7
        )`,
        [
          params.candidateId,
          params.baseScore,
          params.finalScore,
          params.verdict,
          JSON.stringify(params.scoreJson),
          JSON.stringify(params.groupBreakdown),
          params.createdBy,
        ]
      )
    } catch (error) {
      logger.error('DB error in saveCandidateScore', { error })
      throw new AppError('Database error', 500)
    }
  },
}
