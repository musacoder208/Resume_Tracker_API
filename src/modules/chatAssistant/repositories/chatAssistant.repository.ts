import { pool } from '@shared/config/db'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

// Read only — Python saves the chat (mechsoft.fn_chat_save_message).
// Each function returns the JSON built by the matching PostgreSQL function
// in sql/chat-assistant.sql.

export const chatAssistantRepository = {
  async getSessions(companyId: number, userId: number): Promise<unknown> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_chat_get_sessions($1, $2) AS data',
        [companyId, userId]
      )
      return result.rows[0]?.data ?? []
    } catch (error) {
      logger.error('DB error in getSessions', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getMessages(companyId: number, userId: number, sessionId: string): Promise<unknown> {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_chat_get_messages($1, $2, $3) AS data',
        [companyId, userId, sessionId]
      )
      return result.rows[0]?.data ?? null
    } catch (error) {
      logger.error('DB error in getMessages', { error })
      throw new AppError('Database error', 500)
    }
  },
}
