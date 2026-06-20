import { pool } from '@shared/config/db'
import logger from '@shared/logger/logger'
import { AppError } from '@shared/middleware/errorHandler'

export const commonService = {
  async getModuleIdByCode(moduleCode: string): Promise<{ module_id: number | null }> {
    try {
      const result = await pool.query(
        'SELECT public.fn_get_module_id_by_code($1) AS result',
        [moduleCode]
      )
      const data = result.rows[0]?.result as { module_id: number | null } ?? { module_id: null }
      return data
    } catch (error) {
      logger.error('DB error in getModuleIdByCode', { error })
      throw new AppError('Database error', 500)
    }
  },

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

  async getMasterDataList(companyId: number) {
    try {
      const [
        industryTypes,
        companySizes,
        countries,
        states,
        cities,
        jobTitles,
        modules,
        seniorities,
        statuses,
        feedbackStatuses,
      ] = await Promise.all([
        pool.query(
          'SELECT id, industry_type_name AS name FROM public.mst_industry_type WHERE is_active = TRUE ORDER BY industry_type_name'
        ),
        pool.query(
          'SELECT id, size_label AS name FROM public.mst_company_size ORDER BY id'
        ),
        pool.query(
          'SELECT country_id AS id, country_name AS name, country_code AS code FROM public.mst_country ORDER BY country_name'
        ),
        pool.query(
          'SELECT state_id AS id, country_id AS "countryId", state_name AS name, state_code AS code FROM public.mst_state ORDER BY state_name'
        ),
        pool.query(
          'SELECT city_id AS id, state_id AS "stateId", city_name AS name FROM public.mst_city ORDER BY city_name'
        ),
        pool.query(
          `SELECT jt.id, jt.title AS name
           FROM public.mst_jobtitle jt
           JOIN public.mst_company c ON c.industry_type_id = jt.industry_type_id
           WHERE c.company_id = $1
             AND c.is_deleted = FALSE
           ORDER BY jt.title`,
          [companyId]
        ),
        pool.query(
          `SELECT module_id AS id, module_name AS name, module_code AS code,
                  path, icon, display_order AS "displayOrder"
           FROM public.mst_modules
           ORDER BY display_order`
        ),
        pool.query(
          'SELECT id, name FROM public.mst_seniority ORDER BY id'
        ),
        pool.query(
          'SELECT status_id AS id, status_name AS name, module_id AS "moduleId" FROM public.mst_status ORDER BY status_name'
        ),
        pool.query(
          'SELECT id, status_name AS name FROM public.mst_feedbackstatus ORDER BY id'
        ),
      ])

      const statusesByModule = statuses.rows.reduce<Record<number, { id: number; name: string }[]>>(
        (acc, row) => {
          const mid = row.moduleId as number
          if (!acc[mid]) acc[mid] = []
          acc[mid].push({ id: row.id as number, name: row.name as string })
          return acc
        },
        {}
      )

      return {
        industryTypes:    industryTypes.rows,
        companySizes:     companySizes.rows,
        countries:        countries.rows,
        states:           states.rows,
        cities:           cities.rows,
        jobTitles:        jobTitles.rows,
        modules:          modules.rows,
        seniorities:      seniorities.rows,
        statuses:         statusesByModule,
        feedbackStatuses: feedbackStatuses.rows,
      }
    } catch (error) {
      logger.error('DB error in getMasterDataList', { error })
      throw new AppError('Database error', 500)
    }
  },
}
