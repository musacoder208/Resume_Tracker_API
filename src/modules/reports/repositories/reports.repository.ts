import { pool } from '@shared/config/db'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

// Each function returns the JSON built by the matching PostgreSQL function
// in sql/reports-functions.sql (shape documented there).

export const reportsRepository = {
  async getAiUsageExport(
    companyId: number,
    userId: number,
    fromDate: string | null,
    toDate: string | null,
    jdIds: number[] | null
  ): Promise<unknown> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_ai_usage_export($1, $2, $3::date, $4::date, $5::int[]) AS data',
        [companyId, userId, fromDate, toDate, jdIds]
      )
      return result.rows[0]?.data ?? null
    } catch (error) {
      logger.error('DB error in getAiUsageExport', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getAiUsageJdDropdown(companyId: number): Promise<unknown> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_ai_usage_jd_dropdown($1) AS data',
        [companyId]
      )
      return result.rows[0]?.data ?? []
    } catch (error) {
      logger.error('DB error in getAiUsageJdDropdown', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getAiUsageJds(
    companyId: number,
    fromDate: string | null,
    toDate: string | null,
    jdIds: number[] | null
  ): Promise<unknown> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_ai_usage_jds($1, $2::date, $3::date, $4::int[]) AS data',
        [companyId, fromDate, toDate, jdIds]
      )
      return result.rows[0]?.data ?? { summary: null, list: [] }
    } catch (error) {
      logger.error('DB error in getAiUsageJds', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getAiUsageJdProcesses(
    companyId: number,
    jdId: number | null,
    unassigned: boolean,
    fromDate: string | null,
    toDate: string | null
  ): Promise<unknown> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_ai_usage_jd_processes($1, $2, $3, $4::date, $5::date) AS data',
        [companyId, jdId, unassigned, fromDate, toDate]
      )
      return result.rows[0]?.data ?? []
    } catch (error) {
      logger.error('DB error in getAiUsageJdProcesses', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getAiUsageJdCandidates(
    companyId: number,
    jdId: number | null,
    unassigned: boolean,
    fromDate: string | null,
    toDate: string | null,
    page: number,
    pageSize: number
  ): Promise<unknown> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_ai_usage_jd_candidates($1, $2, $3, $4::date, $5::date, $6, $7) AS data',
        [companyId, jdId, unassigned, fromDate, toDate, page, pageSize]
      )
      return result.rows[0]?.data ?? { total_count: 0, summary: null, list: [] }
    } catch (error) {
      logger.error('DB error in getAiUsageJdCandidates', { error })
      throw new AppError('Database error', 500)
    }
  },
}
