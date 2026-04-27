import { pool } from '@shared/config/db'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

export const companyProfileRepository = {
  async getModuleStatusId(moduleName: string, statusName: string): Promise<number | null> {
    try {
      const result = await pool.query(
        'SELECT public.fn_get_module_status_id($1, $2) AS status_id',
        [moduleName, statusName]
      )
      return result.rows[0]?.status_id ?? null
    } catch (error) {
      logger.error('DB error in getModuleStatusId', { error })
      throw new AppError('Database error', 500)
    }
  },

  async isAdminRole(roleId: number, companyId: number): Promise<boolean> {
    try {
      console.log(roleId,'roleId');
      console.log(companyId,'companyId');
      const result = await pool.query(
        'SELECT public.fn_is_admin_role($1, $2) AS is_admin',
        [roleId, companyId]
      )
      return result.rows[0]?.is_admin ?? false
    } catch (error) {
      logger.error('DB error in isAdminRole', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getProfileHeader(companyId: number) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_profile_header($1) AS header',
        [companyId]
      )
      return result.rows[0]?.header ?? null
    } catch (error) {
      logger.error('DB error in getProfileHeader', { error })
      throw new AppError('Database error', 500)
    }
  },

  async createProfileHeader(companyId: number, statusId: number, createdBy: number) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_create_profile_header($1, $2, $3) AS header',
        [companyId, statusId, createdBy]
      )
      return result.rows[0]?.header ?? null
    } catch (error) {
      logger.error('DB error in createProfileHeader', { error })
      throw new AppError('Database error', 500)
    }
  },

  async setProfileCompleted(companyId: number, modifiedBy: number) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_set_profile_completed($1, $2) AS success',
        [companyId, modifiedBy]
      )
      return result.rows[0]?.success ?? false
    } catch (error) {
      logger.error('DB error in setProfileCompleted', { error })
      throw new AppError('Database error', 500)
    }
  },

  async completeProfileHeader(companyId: number, statusId: number, modifiedBy: number) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_complete_profile_header($1, $2, $3) AS header',
        [companyId, statusId, modifiedBy]
      )
      return result.rows[0]?.header ?? null
    } catch (error) {
      logger.error('DB error in completeProfileHeader', { error })
      throw new AppError('Database error', 500)
    }
  },

  async upsertChatSession(
    companyId: number,
    fieldKey: string,
    contextData: Record<string, unknown>,
    createdBy: number,
    modifiedBy: number
  ) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_upsert_chat_session($1, $2, $3, $4, $5) AS session',
        [companyId, fieldKey, JSON.stringify(contextData), createdBy, modifiedBy]
      )
      return result.rows[0]?.session ?? null
    } catch (error) {
      logger.error('DB error in upsertChatSession', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getActiveChatSession(companyId: number) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_active_chat_session($1) AS session',
        [companyId]
      )
      return result.rows[0]?.session ?? null
    } catch (error) {
      logger.error('DB error in getActiveChatSession', { error })
      throw new AppError('Database error', 500)
    }
  },

  async upsertProfileQA(
    companyId: number,
    fieldKey: string,
    questionText: string,
    answerValue: Record<string, unknown>,
    createdBy: number,
    modifiedBy: number
  ) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_upsert_profile_qa($1, $2, $3, $4, $5, $6) AS qa',
        [companyId, fieldKey, questionText, JSON.stringify(answerValue), createdBy, modifiedBy]
      )
      return result.rows[0]?.qa ?? null
    } catch (error) {
      logger.error('DB error in upsertProfileQA', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getProfileQA(companyId: number) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_profile_qa($1) AS qa',
        [companyId]
      )
      return result.rows[0]?.qa ?? []
    } catch (error) {
      logger.error('DB error in getProfileQA', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getProfileQAByFieldKey(companyId: number, fieldKey: string) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_profile_qa_by_field($1, $2) AS qa',
        [companyId, fieldKey]
      )
      return result.rows[0]?.qa ?? null
    } catch (error) {
      logger.error('DB error in getProfileQAByFieldKey', { error })
      throw new AppError('Database error', 500)
    }
  },

  async bulkUpdateProfileWithAudit(
    companyId: number,
    changes: Array<{ field_key: string; after: { value: unknown } }>,
    changeReason: string,
    contextData: Record<string, unknown>,
    modifiedBy: number
  ) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_bulk_update_profile_with_audit($1, $2, $3, $4, $5) AS result',
        [companyId, JSON.stringify(changes), changeReason, JSON.stringify(contextData), modifiedBy]
      )
      return result.rows[0]?.result ?? null
    } catch (error) {
      logger.error('DB error in bulkUpdateProfileWithAudit', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getProfileList(companyId: number) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_get_profile_list($1) AS list',
        [companyId]
      )
      return result.rows[0]?.list ?? []
    } catch (error) {
      logger.error('DB error in getProfileList', { error })
      throw new AppError('Database error', 500)
    }
  },

  async softDeleteProfile(companyId: number, modifiedBy: number) {
    try {
      const result = await pool.query(
        'SELECT mechsoft.fn_soft_delete_profile($1, $2) AS success',
        [companyId, modifiedBy]
      )
      return result.rows[0]?.success ?? false
    } catch (error) {
      logger.error('DB error in softDeleteProfile', { error })
      throw new AppError('Database error', 500)
    }
  },
}
