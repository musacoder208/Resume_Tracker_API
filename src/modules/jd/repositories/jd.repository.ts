import { pool } from '@shared/config/db'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

export const jdRepository = {
  async getCompanyProfileContext(companyId: number): Promise<Record<string, unknown> | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM mechsoft.fn_get_jd_profile_context($1)',
        [companyId]
      )
      return (result.rows[0]?.context_data as Record<string, unknown>) ?? null
    } catch (error) {
      logger.error('DB error in getCompanyProfileContext', { error })
      throw new AppError('Database error', 500)
    }
  },

  async addUpdateJd(params: {
    jdId: number | null
    companyId: number
    jobTitleId: number
    seniorityId: number
    minExp: number | null
    maxExp: number | null
    sessionId: string
    fieldKey: string
    questionText: string
    answerValue: string
    qaHistory: Record<string, unknown>
    jdTheory: string | null
    userId: number
  }): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT mechsoft.fn_add_update_jd(
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::jsonb, $11::jsonb, $12, $13
        ) AS jd_id`,
        [
          params.jdId,
          params.companyId,
          params.jobTitleId,
          params.seniorityId,
          params.minExp,
          params.maxExp,
          params.sessionId,
          params.fieldKey,
          params.questionText,
          JSON.stringify(params.answerValue),
          JSON.stringify(params.qaHistory),
          params.jdTheory,
          params.userId,
        ]
      )
      return result.rows[0]?.jd_id as number
    } catch (error) {
      logger.error('DB error in addUpdateJd', { error })
      throw new AppError('Database error', 500)
    }
  },

  async finalizeJd(params: {
    jdId: number
    jdTheory: string
    userId: number
  }): Promise<void> {
    try {
      await pool.query(
        'SELECT mechsoft.fn_finalize_jd($1, $2, $3)',
        [params.jdId, params.jdTheory, params.userId]
      )
    } catch (error) {
      logger.error('DB error in finalizeJd', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getAllJDs(params: {
    companyId: number
    jobTitleId?: number
    seniorityId?: number
  }): Promise<Record<string, unknown>[]> {
    try {
      const result = await pool.query(
        'SELECT * FROM mechsoft.fn_get_all_jds($1, $2, $3)',
        [params.companyId, params.jobTitleId ?? null, params.seniorityId ?? null]
      )
      return result.rows
    } catch (error) {
      logger.error('DB error in getAllJDs', { error })
      throw new AppError('Database error', 500)
    }
  },
}
