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
    responsibilities: string[]
    createdBy: number
  }): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT mechsoft.add_update_candidate_details(
          $1, $2, $3, $4, $5, $6, $7, $8::text[],
          $9, $10, $11, $12, $13, $14::jsonb,
          $15::jsonb, $16::jsonb, $17::text[], $18::text[], $19::text[], $20::text[], $21
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
          params.responsibilities,
          params.createdBy,
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

  async getJDDropdown(): Promise<Array<{ jd_id: number; label: string }>> {
    try {
      const result = await pool.query('SELECT * FROM mechsoft.fn_get_jd_dropdown()')
      return result.rows
    } catch (error) {
      logger.error('DB error in getJDDropdown', { error })
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

  async getCandidatesForScoring(jdId: number): Promise<Record<string, unknown>[]> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_candidates_for_scoring($1) AS candidates',
        [jdId]
      )
      const candidates = result.rows[0]?.candidates
      return Array.isArray(candidates) ? candidates : []
    } catch (error) {
      logger.error('DB error in getCandidatesForScoring', { error })
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
