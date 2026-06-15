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
    answerValue: string[]
    qaHistory: Record<string, unknown>
    jdTheory: string | null
    userId: number
    mode: string | null
    workModel: string | null
  }): Promise<number> {
    try {
      const result = await pool.query(
        `SELECT mechsoft.fn_add_update_jd(
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::text[], $11::jsonb, $12, $13, $14, $15
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
          params.answerValue,
          JSON.stringify(params.qaHistory),
          params.jdTheory,
          params.userId,
          params.mode,
          params.workModel,
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
    jobTitleId: number
    seniorityId: number
    jobTitle: string | null
    sessionId: string
    statusName: string
    theory: string | null
    dataBlob: Record<string, unknown> | null
    weightageJson: Record<string, unknown> | null
    isWeightage: boolean
  } | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM mechsoft.fn_get_jd_details_by_id($1)',
        [jdId]
      )
      if (!result.rows.length) return null

      const row = result.rows[0]
      return {
        jdId:          row.jd_id          as number,
        jobTitleId:    row.job_title_id   as number,
        seniorityId:   row.seniority_id   as number,
        jobTitle:      row.job_title      as string | null,
        sessionId:     row.session_id     as string,
        statusName:    row.status_name    as string,
        theory:        row.theory         as string | null,
        dataBlob:      row.data_blob      as Record<string, unknown> | null,
        weightageJson: row.weightage_json as Record<string, unknown> | null,
        isWeightage:   row.is_weightage   as boolean,
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

  async deleteJd(params: { jdId: number; userId: number }): Promise<boolean> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_delete_jd($1, $2) AS deleted',
        [params.jdId, params.userId]
      )
      return result.rows[0]?.deleted as boolean
    } catch (error) {
      const msg = (error as Error).message
      logger.error('DB error in deleteJd', { message: msg, error })
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

  async saveJdEditTheory(params: {
    jdId: number
    renderedText: string
    modifiedFields: string[]
    updatedFieldValues: Record<string, unknown>
    userId: number
  }): Promise<void> {
    try {
      await pool.query(
        'SELECT mechsoft.fn_save_jd_edit_theory($1, $2, $3, $4::jsonb, $5)',
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
      logger.error('DB error in saveJdEditTheory', { message: msg, error })
      throw new AppError(`Database error: ${msg}`, 500)
    }
  },

  async updateJdQaHistory(params: {
    jdId: number
    fieldKey: string
    newValue: unknown
    userId: number
  }): Promise<void> {
    try {
      await pool.query(
        'SELECT mechsoft.fn_update_jd_qa_history($1, $2, $3::jsonb, $4)',
        [params.jdId, params.fieldKey, JSON.stringify(params.newValue), params.userId]
      )
    } catch (error) {
      const msg = (error as Error).message
      logger.error('DB error in updateJdQaHistory', { message: msg, error })
      throw new AppError(`Database error: ${msg}`, 500)
    }
  },

  async editJdQaAnswer(params: {
    jdId: number
    fieldKey: string
    newAnswer: string[]
    userId: number
  }): Promise<void> {
    try {
      await pool.query(
        'SELECT mechsoft.fn_edit_jd_qa_answer($1, $2, $3::text[], $4)',
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
    page: number
    pageSize: number
    sortBy: string
    sortOrder: string
  }): Promise<{ rows: Record<string, unknown>[]; totalCount: number }> {
    const SORT_COLUMN_MAP: Record<string, string> = {
      job_title:   'job_title',
      seniority:   'seniority',
      min_exp:     'min_exp',
      max_exp:     'max_exp',
      status_name: 'status_name',
      work_model:  'work_model',
      start_date:  'start_date',
    }

    const sortCol  = SORT_COLUMN_MAP[params.sortBy] ?? 'start_date'
    const sortDir  = params.sortOrder === 'asc' ? 'ASC' : 'DESC'
    const offset   = (params.page - 1) * params.pageSize

    try {
      const result = await pool.query(
        `SELECT * FROM mechsoft.fn_get_all_jds($1, $2, $3)
         ORDER BY ${sortCol} ${sortDir}
         LIMIT $4 OFFSET $5`,
        [
          params.companyId,
          params.jobTitleId ?? null,
          params.seniorityId ?? null,
          params.pageSize,
          offset,
        ]
      )
      const totalCount = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0
      return { rows: result.rows, totalCount }
    } catch (error) {
      const msg = (error as Error).message
      logger.error('DB error in getAllJDs', { error })
      throw new AppError(`Database error: ${msg}`, 500)
    }
  },

  async getJdCounts(companyId: number): Promise<{
    totalJds: number
    addedThisWeek: number
    remoteRoles: number
    hybridRoles: number
  }> {
    try {
      const result = await pool.query(
        'SELECT * FROM mechsoft.fn_get_jd_counts($1)',
        [companyId]
      )
      const row = result.rows[0]
      return {
        totalJds:       Number(row.total_jds),
        addedThisWeek:  Number(row.added_this_week),
        remoteRoles:    Number(row.remote_roles),
        hybridRoles:    Number(row.hybrid_roles),
      }
    } catch (error) {
      logger.error('DB error in getJdCounts', { error })
      throw new AppError('Database error', 500)
    }
  },
}
