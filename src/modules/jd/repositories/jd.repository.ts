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
    mode: string | null
  }): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT mechsoft.fn_add_update_jd(
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::jsonb, $11::jsonb, $12, $13, $14
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
          params.mode,
        ]
      )
      return result.rows[0]?.jd_id as number
    } catch (error) {
      const msg = (error as Error).message
      logger.error('DB error in addUpdateJd', { message: msg, error })
      throw new AppError(`Database error: ${msg}`, 500)
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

  async getJdDetailsById(jdId: number): Promise<{
    jdId: number
    statusName: string
    jdTheory: string | null
    qa: { fieldKey: string; questionText: string; answerValue: string; mode: string | null }[]
    sessionId: string
    fieldValues: Record<string, unknown> | null
    fieldProgress: Record<string, unknown> | null
    questionCounts: Record<string, unknown> | null
    weightageJson: Record<string, unknown> | null
  } | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM mechsoft.fn_get_jd_details_by_id($1)',
        [jdId]
      )
      if (!result.rows.length) return null

      const first = result.rows[0]
      return {
        jdId: first.jd_id as number,
        sessionId: first.session_id as string,
        statusName: first.status_name as string,
        jdTheory: first.jd_theory as string | null,
        fieldValues: first.field_values as Record<string, unknown> | null,
        fieldProgress: first.field_progress as Record<string, unknown> | null,
        questionCounts: first.question_counts as Record<string, unknown> | null,
        weightageJson: first.weightage_json as Record<string, unknown> | null,
        qa: result.rows.map((r) => ({
          fieldKey: r.field_key as string,
          questionText: r.question_text as string,
          answerValue: r.answer_value as string,
          mode: r.mode as string | null,
        })),
      }
    } catch (error) {
      const msg = (error as Error).message
      logger.error('DB error in getJdDetailsById', { message: msg, error })
      throw new AppError(`Database error: ${msg}`, 500)
    }
  },

  async addUpdateJdWeightage(params: {
    jdId: number
    weightageJson: Record<string, unknown>
    capabilities: Array<{
      capability: string
      weight: number
      required: string[]
      optional: string[]
      description: string
    }>
    userId: number
  }): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT mechsoft.fn_add_update_jd_weightage($1, $2::jsonb, $3::jsonb, $4) AS weightage_id`,
        [
          params.jdId,
          JSON.stringify(params.weightageJson),
          JSON.stringify(params.capabilities),
          params.userId,
        ]
      )
      return result.rows[0]?.weightage_id as number
    } catch (error) {
      const msg = (error as Error).message
      logger.error('DB error in addUpdateJdWeightage', { message: msg, error })
      throw new AppError(`Database error: ${msg}`, 500)
    }
  },

  async updateJdTheory(params: {
    jdId: number
    renderedText: string
    modifiedFields: string[]
    updatedFieldValues: Record<string, unknown>
    userId: number
  }): Promise<void> {
    try {
      await pool.query(
        'SELECT mechsoft.fn_update_jd_theory($1, $2, $3, $4::jsonb, $5)',
        [
          params.jdId,
          params.renderedText,
          params.modifiedFields,
          JSON.stringify(params.updatedFieldValues),
          params.userId,
        ]
      )
    } catch (error) {
      const msg = (error as Error).message
      logger.error('DB error in updateJdTheory', { message: msg, error })
      throw new AppError(`Database error: ${msg}`, 500)
    }
  },

  async editJdQaAnswer(params: {
    jdId: number
    fieldKey: string
    newAnswer: string
    userId: number
  }): Promise<void> {
    try {
      await pool.query(
        'SELECT mechsoft.fn_edit_jd_qa_answer($1, $2, $3, $4)',
        [params.jdId, params.fieldKey, params.newAnswer, params.userId]
      )
    } catch (error) {
      const msg = (error as Error).message
      logger.error('DB error in editJdQaAnswer', { message: msg, error })
      throw new AppError(`Database error: ${msg}`, 500)
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
