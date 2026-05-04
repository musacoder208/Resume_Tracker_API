import { pool } from '@shared/config/db'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

export const commonService = {
  async getCompanyRegistrationDetails(companyId: number) {
    try {
      const result = await pool.query(
        'SELECT public.fn_get_company_registration_details($1) AS company',
        [companyId]
      )
      return result.rows[0]?.company ?? null
    } catch (error) {
      logger.error('DB error in getCompanyRegistrationDetails', { error })
      throw new AppError('Database error', 500)
    }
  },

  async getMasterDataList() {
    try {
      const result = await pool.query(
        'SELECT public.fn_get_master_data_list() AS master_data'
      )
      return result.rows[0]?.master_data ?? null
    } catch (error) {
      logger.error('DB error in getMasterDataList', { error })
      throw new AppError('Database error', 500)
    }
  },
}
