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
-- 2. Master data is fetched via Promise.all in Node.js
--    (see src/shared/services/common.service.ts)
--    Drop the old function if it exists.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_get_master_data_list(INT);


-- ─────────────────────────────────────────────────────────────
-- 3. Get module_id by module_code
--    Returns module_id from public.mst_modules using module_code
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_module_id_by_code(
  p_module_code VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_module_id INT;
BEGIN
  SELECT module_id INTO v_module_id
  FROM public.mst_modules
  WHERE module_code = p_module_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('module_id', NULL);
  END IF;

  RETURN jsonb_build_object('module_id', v_module_id);
END;
$$;

