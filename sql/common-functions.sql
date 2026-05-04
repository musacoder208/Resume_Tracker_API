-- =============================================================
-- Common / Shared PostgreSQL Functions
-- Schema: public
-- Run this script once against your target database.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. Get company registration details by company_id
--    Joins: mst_industry_type, mst_company_size, mst_country, mst_state
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_company_registration_details(
    p_company_id INT
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'company_id',       cm.company_id,
        'company_name',     cm.company_name,
        'company_email',    cm.company_email,
        'phone_number',     cm.phone_number,
        'company_address',  cm.company_address,
        'pincode',          cm.pincode,
        'city',             cm.city,
        'admin_name',       cm.admin_name,
        'status_id',        cm.status_id,
        'subdomain',        cm.subdomain,
        'schema_name',      cm.schema_name,
        'submitted_date',   cm.submitted_date,
        'approved_date',    cm.approved_date,
        'industry_type', json_build_object(
            'industry_type_id',   it.industry_type_id,
            'industry_type_name', it.industry_type_name
        ),
        'company_size', json_build_object(
            'company_size_id', cs.company_size_id,
            'size_label',      cs.size_label
        ),
        'country', json_build_object(
            'country_id',   c.country_id,
            'country_name', c.country_name,
            'country_code', c.country_code
        ),
        'state', json_build_object(
            'state_id',   s.state_id,
            'state_name', s.state_name,
            'state_code', s.state_code
        )
    )
    INTO v_result
    FROM   public.mst_company          cm
    LEFT JOIN public.mst_industry_type it ON it.industry_type_id = cm.industry_type_id
                                         AND it.is_active        = TRUE
    LEFT JOIN public.mst_company_size  cs ON cs.company_size_id  = cm.company_size_id
                                         AND cs.is_active        = TRUE
    LEFT JOIN public.mst_country       c  ON c.country_id        = cm.country_id
                                         AND c.is_active         = TRUE
    LEFT JOIN public.mst_state         s  ON s.state_id          = cm.state_id
                                         AND s.is_active         = TRUE
    WHERE  cm.company_id = p_company_id
      AND  cm.is_deleted = FALSE;

    RETURN v_result;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2. Get all master data lists in a single call
--    Tables: mst_industry_type, mst_company_size, mst_country,
--            mst_state, mst_city, mst_jobtitle, mst_modules,
--            mst_seniority, mst_status
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_master_data_list()
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(

        'industryTypes', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'industryTypeId',   industry_type_id,
                    'industryTypeName', industry_type_name
                ) ORDER BY industry_type_name
            ), '[]'::json)
            FROM public.mst_industry_type
            WHERE is_active = TRUE
        ),

        'companySizes', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'companySizeId', company_size_id,
                    'sizeLabel',     size_label
                ) ORDER BY company_size_id
            ), '[]'::json)
            FROM public.mst_company_size
            WHERE is_active = TRUE
        ),

        'countries', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'countryId',   country_id,
                    'countryName', country_name,
                    'countryCode', country_code
                ) ORDER BY country_name
            ), '[]'::json)
            FROM public.mst_country
            WHERE is_active = TRUE
        ),

        'states', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'stateId',   state_id,
                    'countryId', country_id,
                    'stateName', state_name,
                    'stateCode', state_code
                ) ORDER BY state_name
            ), '[]'::json)
            FROM public.mst_state
            WHERE is_active = TRUE
        ),

        'cities', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'cityId',   city_id,
                    'stateId',  state_id,
                    'cityName', city_name
                ) ORDER BY city_name
            ), '[]'::json)
            FROM public.mst_city
            WHERE is_active = TRUE
        ),

        'jobTitles', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'jobTitleId',   job_title_id,
                    'jobTitleName', job_title_name
                ) ORDER BY job_title_name
            ), '[]'::json)
            FROM public.mst_jobtitle
            WHERE is_active = TRUE
        ),

        'modules', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'moduleId',     module_id,
                    'moduleName',   module_name,
                    'moduleCode',   module_code,
                    'path',         path,
                    'icon',         icon,
                    'displayOrder', display_order
                ) ORDER BY display_order
            ), '[]'::json)
            FROM public.mst_modules
            WHERE is_active = TRUE
        ),

        'seniorities', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'seniorityId',   seniority_id,
                    'seniorityName', seniority_name
                ) ORDER BY seniority_id
            ), '[]'::json)
            FROM public.mst_seniority
            WHERE is_active = TRUE
        ),

        'statuses', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'statusId',   status_id,
                    'statusName', status_name,
                    'moduleId',   module_id
                ) ORDER BY status_name
            ), '[]'::json)
            FROM public.mst_status
            WHERE is_active = TRUE
        )

    ) INTO v_result;

    RETURN v_result;
END;
$$;
