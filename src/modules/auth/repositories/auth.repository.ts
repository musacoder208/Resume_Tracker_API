import { pool } from '@shared/config/db'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

export const authRepository = {
  async findUserByUsername(username: string, companyId: number) {
    try {
      const result = await pool.query(
        'SELECT * FROM public.fn_get_user_for_login($1, $2)',
        [username, companyId]
      )
      return result.rows[0] ?? null
    } catch (error) {
      logger.error('DB error in public.findUserByUsername', { error })
      throw new AppError('Database error', 500)
    }
  },

  async saveRefreshToken(
    userId: number,
    companyId: number,
    token: string,
    expiresAt: Date,
    roleId: number
  ) {
    try {
      await pool.query(
        'SELECT public.fn_save_refresh_token($1, $2, $3, $4, $5)',
        [userId, companyId, token, expiresAt, roleId]
      )
    } catch (error) {
      logger.error('DB error in saveRefreshToken', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getRefreshToken(token: string) {
    try {
      const result = await pool.query(
        'SELECT * FROM public.fn_get_refresh_token($1)',
        [token]
      )
      return result.rows[0] ?? null
    } catch (error) {
      logger.error('DB error in getRefreshToken', { error })
      throw new AppError('Database error', 500)
    }
  },

  async revokeRefreshToken(token: string, userId: number, companyId: number) {
    try {
      await pool.query(
        'SELECT * FROM public.fn_revoke_refresh_token($1, $2, $3)',
        [token, userId, companyId]
      )
    } catch (error) {
      logger.error('DB error in revokeRefreshToken', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getUserPermissions(userId: number, companyId: number) {
    try {
      const result = await pool.query(
        'SELECT * from public.fn_get_user_permissions($1, $2)',
        [userId, companyId]
      )
      return result.rows[0]?.fn_get_user_permissions ?? []
    } catch (error) {
      logger.error('DB error in getUserPermissions', { error })
      throw new AppError('Database error', 500)
    }
  },
}
