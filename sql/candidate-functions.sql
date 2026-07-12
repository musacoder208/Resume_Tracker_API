-- ============================================================
-- Candidate Module PostgreSQL Functions
-- Schema: mechsoft
-- ============================================================

-- ------------------------------------------------------------
-- DDL: add upload tracking columns to tbl_candidates_header
-- Run once; safe to re-run (IF NOT EXISTS guard).
-- ------------------------------------------------------------
ALTER TABLE mechsoft.tbl_candidates_header
  ADD COLUMN IF NOT EXISTS upload_status VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reason        TEXT         DEFAULT NULL;


-- ------------------------------------------------------------
-- 0. fn_check_candidate_duplicate_by_jd
--    Validates input, checks for duplicates in DB.
--    Saves a record for duplicate/incomplete cases.
--    Returns JSONB with only: { status, reason }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_check_candidate_duplicate_by_jd(
  p_jd_id     BIGINT,
  p_full_name VARCHAR,
  p_email     VARCHAR,
  p_phone     VARCHAR,
  p_job_title VARCHAR,
  p_created_by BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_status    VARCHAR(20);
  v_reason    TEXT;
  v_status_id BIGINT;
BEGIN
  -- 1. Validate: email AND phone both empty
  IF (p_email IS NULL OR TRIM(p_email) = '')
    AND (p_phone IS NULL OR TRIM(p_phone) = '') THEN
    v_status := 'incomplete';
    v_reason := 'Email or phone is empty.';

  -- 2. Validate: job_title empty
  ELSIF p_job_title IS NULL OR TRIM(p_job_title) = '' THEN
    v_status := 'incomplete';
    v_reason := 'Job title is missing.';

  -- 3. Check duplicate in DB
  ELSIF EXISTS (
    SELECT 1
    FROM mechsoft.tbl_candidates_header
    WHERE jd_id        = p_jd_id
      AND LOWER(email) = LOWER(p_email)
      AND phone        = p_phone
      AND is_deleted   = FALSE
  ) THEN
    v_status := 'duplicate';
    v_reason := 'Already exists in DB.';

  ELSE
    -- 4. Not duplicate, all valid
    RETURN jsonb_build_object('status', 'success', 'reason', '');
  END IF;

  -- Lookup draft status_id for CAND_MGT module
  SELECT s.status_id INTO v_status_id
  FROM public.mst_status s
  INNER JOIN public.mst_modules m ON m.module_id = s.module_id
  WHERE m.module_code = 'CAND_MGT'
    AND s.status_code = 'draft'
  LIMIT 1;

  -- Save duplicate / incomplete record for tracking
  INSERT INTO mechsoft.tbl_candidates_header (
    jd_id,
    full_name,
    email,
    phone,
    upload_status,
    reason,
    status_id,
    is_deleted,
    created_by,
    created_date,
    modified_by,
    modified_date
  )
  VALUES (
    p_jd_id,
    p_full_name,
    p_email,
    p_phone,
    v_status,
    v_reason,
    v_status_id,
    FALSE,
    p_created_by,
    NOW(),
    p_created_by,
    NOW()
  );

  RETURN jsonb_build_object('status', v_status, 'reason', v_reason);
END;
$$;


-- ------------------------------------------------------------
-- 1. fn_check_candidate_duplicate
--    Returns true if a candidate with the same full_name,
--    email and phone already exists (case-insensitive).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_check_candidate_duplicate(
  p_full_name VARCHAR,
  p_email     VARCHAR,
  p_phone     VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM mechsoft.tbl_candidates_header
    WHERE LOWER(full_name) = LOWER(p_full_name)
      AND LOWER(email)     = LOWER(p_email)
      AND phone            = p_phone
      AND is_deleted       = FALSE
  );
END;
$$;


-- ------------------------------------------------------------
-- 2. fn_get_jd_dropdown
--    Returns jd_id + label (seniority + job title) for all
--    non-deleted JDs whose status_code is 'ready'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_jd_dropdown()
RETURNS TABLE(jd_id BIGINT, label TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.jd_id,
    CONCAT(s.name, ' ', t.title)::TEXT AS label
  FROM mechsoft.tbl_jd_header h
  JOIN public.mst_status st
    ON st.status_id   = h.status_id
   AND st.status_code = 'ready'
  JOIN public.mst_seniority s
    ON s.id          = h.seniority_id
   AND s.is_deleted  = FALSE
  JOIN public.mst_jobtitle t
    ON t.id          = h.job_title_id
   AND t.is_deleted  = FALSE
  WHERE h.is_deleted = FALSE;
END;
$$;


-- ------------------------------------------------------------
-- 3. add_update_candidate_details
--    Inserts a full candidate record across all related tables
--    and returns the new candidate_id.
--
--    Inserts into:
--      tbl_candidates_header    (1 row)
--      tbl_candidate_education  (1 row per education entry)
--      tbl_candidate_experience (1 row per experience entry,
--                                responsibilities saved per entry)
--      tbl_candidate_skills     (3 rows: technical / core / soft)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.add_update_candidate_details(
  p_jd_id              BIGINT,
  p_full_name          VARCHAR,
  p_email              VARCHAR,
  p_phone              VARCHAR,
  p_location           VARCHAR,
  p_linkedin_url       TEXT,
  p_github_url         TEXT,
  p_portfolio_links    TEXT[],
  p_current_job_title  VARCHAR,
  p_current_company    VARCHAR,
  p_total_experience   NUMERIC,
  p_resume_file_name   TEXT,
  p_resume_file_path   TEXT,
  p_raw_ai_response    JSONB,
  p_education          JSONB,
  p_experience         JSONB,
  p_technical_skills   TEXT[],
  p_core_skills        TEXT[],
  p_soft_skills        TEXT[],
  p_created_by         BIGINT,
  p_upload_status      VARCHAR(20) DEFAULT NULL,
  p_reason             TEXT        DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_candidate_id BIGINT;
  v_edu          JSONB;
  v_exp          JSONB;
  v_status_id    BIGINT;
BEGIN
  -- Lookup draft status_id for CAND_MGT module
  SELECT s.status_id INTO v_status_id
  FROM public.mst_status s
  INNER JOIN public.mst_modules m ON m.module_id = s.module_id
  WHERE m.module_code = 'CAND_MGT'
    AND s.status_code = 'score_pending'
  LIMIT 1;

  -- 1. Insert candidate header
  INSERT INTO mechsoft.tbl_candidates_header (
    jd_id,
    full_name,
    email,
    phone,
    location,
    linkedin_url,
    github_url,
    portfolio_links,
    current_job_title,
    current_company,
    total_experience,
    resume_file_name,
    resume_file_path,
    candidate_json,
    upload_status,
    reason,
    status_id,
    is_deleted,
    created_by,
    created_date,
    modified_by,
    modified_date
  )
  VALUES (
    p_jd_id,
    p_full_name,
    p_email,
    p_phone,
    p_location,
    p_linkedin_url,
    p_github_url,
    p_portfolio_links,
    p_current_job_title,
    p_current_company,
    p_total_experience,
    p_resume_file_name,
    p_resume_file_path,
    p_raw_ai_response,
    p_upload_status,
    p_reason,
    v_status_id,
    FALSE,
    p_created_by,
    NOW(),
    NULL,
    NULL
  )
  RETURNING candidate_id INTO v_candidate_id;

  -- 2. Insert education entries
  FOR v_edu IN SELECT * FROM jsonb_array_elements(p_education)
  LOOP
    INSERT INTO mechsoft.tbl_candidate_education (
      candidate_id,
      degree,
      field_of_study,
      institution_name,
      is_deleted,
      created_by,
      created_date,
      modified_by,
      modified_date
    )
    VALUES (
      v_candidate_id,
      v_edu->>'degree',
      v_edu->>'field_of_study',
      v_edu->>'institution',
      FALSE,
      p_created_by,
      NOW(),
      NULL,
      NULL
    );
  END LOOP;

  -- 3. Insert experience entries (with responsibilities per company)
  FOR v_exp IN SELECT * FROM jsonb_array_elements(p_experience)
  LOOP
    INSERT INTO mechsoft.tbl_candidate_experience (
      candidate_id,
      company_name,
      job_title,
      work_location,
      start_date,
      end_date,
      company_size,
      responsibilities,
      is_deleted,
      created_by,
      created_date,
      modified_by,
      modified_date
    )
    VALUES (
      v_candidate_id,
      v_exp->>'company',
      v_exp->>'position',
      v_exp->>'location',
      v_exp->>'start_date',
      v_exp->>'end_date',
      v_exp->>'company_size',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_exp->'key_responsibilities', '[]'::JSONB))),
      FALSE,
      p_created_by,
      NOW(),
      NULL,
      NULL
    );
  END LOOP;

  -- 4. Insert skills: three rows (technical / core / soft)
  INSERT INTO mechsoft.tbl_candidate_skills (
    candidate_id,
    skill_type,
    skills,
    is_deleted,
    created_by,
    created_date,
    modified_by,
    modified_date
  )
  VALUES
    (v_candidate_id, 'technical', p_technical_skills, FALSE, p_created_by, NOW(), NULL, NULL),
    (v_candidate_id, 'core',      p_core_skills,      FALSE, p_created_by, NOW(), NULL, NULL),
    (v_candidate_id, 'soft',      p_soft_skills,      FALSE, p_created_by, NOW(), NULL, NULL);

  RETURN v_candidate_id;
END;
$$;

-- ------------------------------------------------------------
-- 7. fn_get_candidate_details_by_id
--    Returns a complete candidate profile as a single JSONB.
--    Blocks: personal_info, professional_info, resume,
--            education, experience, skills,
--            responsibilities, score, meta
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_candidate_details_by_id(
  p_candidate_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_candidate       RECORD;
  v_score           RECORD;
  v_education       JSONB;
  v_experience      JSONB;
  v_technical       TEXT[];
  v_core            TEXT[];
  v_soft            TEXT[];
  v_group_breakdown JSONB;
BEGIN
  -- 1. Candidate header
  SELECT * INTO v_candidate
  FROM mechsoft.tbl_candidates_header
  WHERE candidate_id = p_candidate_id
    AND is_deleted   = FALSE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 2. Education
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'degree',           degree,
        'field_of_study',   field_of_study,
        'institution_name', institution_name
      )
    ), '[]'::JSONB
  )
  INTO v_education
  FROM mechsoft.tbl_candidate_education
  WHERE candidate_id = p_candidate_id
    AND is_deleted   = FALSE;

  -- 3. Experience (with responsibilities per company)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'company_name',    company_name,
        'job_title',       job_title,
        'work_location',   work_location,
        'start_date',      start_date,
        'end_date',        end_date,
        'responsibilities', COALESCE(to_jsonb(responsibilities), '[]'::JSONB)
      )
    ), '[]'::JSONB
  )
  INTO v_experience
  FROM mechsoft.tbl_candidate_experience
  WHERE candidate_id = p_candidate_id
    AND is_deleted   = FALSE;

  -- 4. Skills by type
  SELECT skills INTO v_technical
  FROM mechsoft.tbl_candidate_skills
  WHERE candidate_id = p_candidate_id
    AND skill_type   = 'technical'
    AND is_deleted   = FALSE;

  SELECT skills INTO v_core
  FROM mechsoft.tbl_candidate_skills
  WHERE candidate_id = p_candidate_id
    AND skill_type   = 'core'
    AND is_deleted   = FALSE;

  SELECT skills INTO v_soft
  FROM mechsoft.tbl_candidate_skills
  WHERE candidate_id = p_candidate_id
    AND skill_type   = 'soft'
    AND is_deleted   = FALSE;

  -- 5. Score header (using candidate_id)
  SELECT * INTO v_score
  FROM mechsoft.tbl_candidate_score_header
  WHERE candidate_id = p_candidate_id
  LIMIT 1;

  -- 6. Score group breakdown + HR feedback per group
  IF FOUND THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'group_score_id',      sg.group_score_id,
          'score_id',            sg.score_id,
          'group_key',           sg.group_key,
          'group_score',         sg.group_score,
          'weight',              sg.weight,
          'penalty_factor',      sg.penalty_factor,
          'final_contribution',  sg.final_contribution,
          'missing_required',    sg.missing_required,
          'present_required',    sg.present_required,
          'optional_present',    sg.optional_present,
          'optional_missing',    sg.optional_missing,
          'llm_classifications', sg.llm_classifications,
          'hr_feedback', CASE
            WHEN hf.candidate_id IS NOT NULL THEN jsonb_build_object(
              'feedback_type_id', hf.feedback_type_id,
              'user_feedback',    hf.user_feedback
            )
            ELSE NULL
          END
        )
      ), '[]'::JSONB
    )
    INTO v_group_breakdown
    FROM mechsoft.tbl_candidate_score_group sg
    LEFT JOIN mechsoft.tbl_candidate_hr_feedbacks hf
      ON hf.group_score_id = sg.group_score_id
     AND hf.candidate_id   = p_candidate_id
     AND hf.is_deleted     = FALSE
    WHERE sg.score_id = v_score.score_id;
  END IF;

  -- 7. Build and return final JSON
  RETURN jsonb_build_object(
    'candidate_id',   v_candidate.candidate_id,
    'personal_info',  jsonb_build_object(
      'full_name',       v_candidate.full_name,
      'email',           v_candidate.email,
      'phone',           v_candidate.phone,
      'location',        v_candidate.location,
      'linkedin_url',    v_candidate.linkedin_url,
      'github_url',      v_candidate.github_url,
      'portfolio_links', COALESCE(to_jsonb(v_candidate.portfolio_links), '[]'::JSONB)
    ),
    'professional_info', jsonb_build_object(
      'current_job_title', v_candidate.current_job_title,
      'current_company',   v_candidate.current_company,
      'total_experience',  v_candidate.total_experience
    ),
    'resume', jsonb_build_object(
      'file_name', v_candidate.resume_file_name,
      'file_path', v_candidate.resume_file_path
    ),
    'education',  v_education,
    'experience', v_experience,
    'skills',     jsonb_build_object(
      'technical', COALESCE(to_jsonb(v_technical), '[]'::JSONB),
      'core',      COALESCE(to_jsonb(v_core),      '[]'::JSONB),
      'soft',      COALESCE(to_jsonb(v_soft),       '[]'::JSONB)
    ),
    'score', CASE
      WHEN v_score.score_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'score_id',        v_score.score_id,
        'base_score',      v_score.base_score,
        'final_score',     v_score.final_score,
        'verdict',         v_score.verdict,
        'group_breakdown', COALESCE(v_group_breakdown, '[]'::JSONB)
      )
    END,
    'meta', jsonb_build_object(
      'jd_id',        v_candidate.jd_id,
      'created_date', v_candidate.created_date
    )
  );
END;
$$;


-- ------------------------------------------------------------
-- 8. fn_get_feedback_types
--    Returns all active feedback types for dropdown binding.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_feedback_types()
RETURNS TABLE(feedback_type_id BIGINT, feedback_type VARCHAR)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ft.feedback_type_id,
    ft.feedback_type
  FROM mechsoft.tbl_candidate_feedbacktype ft
  WHERE ft.is_active  = TRUE
    AND ft.is_deleted = FALSE
  ORDER BY ft.feedback_type_id;
END;
$$;


-- ------------------------------------------------------------
-- 9. fn_save_candidate_feedback
--    Inserts a new HR feedback record for a candidate.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_save_candidate_feedback(
  p_candidate_id     BIGINT,
  p_feedback_type_id BIGINT,
  p_user_feedback    TEXT,
  p_created_by       INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO mechsoft.tbl_candidate_hr_feedbacks (
    candidate_id,
    feedback_type_id,
    user_feedback,
    is_deleted,
    created_by,
    created_date,
    modified_by,
    modified_date
  )
  VALUES (
    p_candidate_id,
    p_feedback_type_id,
    p_user_feedback,
    FALSE,
    p_created_by,
    NOW(),
    NULL,
    NULL
  );
END;
$$;




-- ------------------------------------------------------------
-- 10. fn_save_update_hr_feedback
--     Hard-deletes all existing feedback for the candidate,
--     then inserts all new records from the JSONB array.
--     Each array element: { group_score_id, feedback_type_id,
--                           user_feedback }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_save_update_hr_feedback(
  p_candidate_id BIGINT,
  p_feedbacks    JSONB,
  p_created_by   INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_item JSONB;
BEGIN
  -- Hard delete all existing feedback for this candidate
  DELETE FROM mechsoft.tbl_candidate_hr_feedbacks
  WHERE candidate_id = p_candidate_id;

  -- Insert all new feedback records
  FOR v_item IN SELECT jsonb_array_elements(p_feedbacks)
  LOOP
    INSERT INTO mechsoft.tbl_candidate_hr_feedbacks (
      candidate_id,
      group_score_id,
      feedback_type_id,
      user_feedback,
      is_deleted,
      created_by,
      created_date,
      modified_by,
      modified_date
    )
    VALUES (
      p_candidate_id,
      (v_item->>'group_score_id')::BIGINT,
      (v_item->>'feedback_type_id')::BIGINT,
      v_item->>'user_feedback',
      FALSE,
      p_created_by,
      NOW(),
      NULL,
      NULL
    );
  END LOOP;
END;
$$;


-- ============================================================
-- SCORING FUNCTIONS
-- ============================================================


-- ------------------------------------------------------------
-- 4. fn_get_jd_weightage
--    Returns the weightage_json for a given JD.
--    Node.js extracts the 'weights' key from the returned JSON.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_jd_weightage(
  p_jd_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_weightage JSONB;
BEGIN
  SELECT weightage_json
  INTO v_weightage
  FROM mechsoft.tbl_jd_weightage_header
  WHERE jd_id = p_jd_id;

  RETURN v_weightage;
END;
$$;


-- ------------------------------------------------------------
-- 5. fn_get_candidates_for_scoring
--    Returns a JSONB array of candidate scoring payloads.
--    Each item contains: candidate_id, location (from
--    personal_info), and all professional_info fields merged.
--    p_candidate_ids filters to specific candidates within JD.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_candidates_for_scoring(
  p_jd_id          BIGINT,
  p_candidate_ids  BIGINT[]
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'candidate_id', candidate_id::TEXT,
      'location',     candidate_json -> 'personal_info' -> 'location' ->> 'value'
    )
    ||
    (candidate_json -> 'professional_info')
  )
  INTO v_result
  FROM mechsoft.tbl_candidates_header
  WHERE jd_id        = p_jd_id
    AND candidate_id = ANY(p_candidate_ids)
    AND is_deleted   = FALSE;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;


-- ------------------------------------------------------------
-- fn_get_candidate_list
--    Returns a JSONB object with:
--      summary     - landing page stats (scoped to p_jd_id)
--      total_count - total matching records (for pagination)
--      candidates  - current page records only
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_candidate_list(
  p_jd_id            BIGINT  DEFAULT NULL,
  p_search_text      TEXT    DEFAULT NULL,
  p_verdict          TEXT    DEFAULT NULL,
  p_experience_range TEXT    DEFAULT NULL,
  p_page             BIGINT  DEFAULT 1,
  p_page_size        BIGINT  DEFAULT 10,
  p_status_id        BIGINT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_candidates  JSONB;
  v_summary     JSONB;
  v_total_count BIGINT;
  v_offset      BIGINT;
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  -- ── 1. Total count (all filters, no LIMIT) ────────────────────
  SELECT COUNT(DISTINCT ch.candidate_id)
  INTO   v_total_count
  FROM   mechsoft.tbl_candidates_header ch
  LEFT JOIN (
    SELECT DISTINCT ON (candidate_id)
           candidate_id, verdict
    FROM   mechsoft.tbl_candidate_score_header
    WHERE  is_deleted = FALSE
    ORDER  BY candidate_id, created_date DESC
  ) sc ON sc.candidate_id = ch.candidate_id
  WHERE ch.is_deleted    = FALSE
    AND ch.upload_status = 'complete'
    AND (p_jd_id     IS NULL OR ch.jd_id     = p_jd_id)
    AND (p_status_id IS NULL OR ch.status_id = p_status_id)
    AND (
      p_search_text IS NULL
      OR ch.full_name ILIKE '%' || p_search_text || '%'
      OR ch.email     ILIKE '%' || p_search_text || '%'
    )
    AND (p_verdict IS NULL OR sc.verdict = p_verdict)
    AND (
      p_experience_range IS NULL OR
      CASE p_experience_range
        WHEN '0-1' THEN ch.total_experience >= 0 AND ch.total_experience < 1
        WHEN '1-3' THEN ch.total_experience >= 1 AND ch.total_experience < 3
        WHEN '3-5' THEN ch.total_experience >= 3 AND ch.total_experience < 5
        WHEN '5-8' THEN ch.total_experience >= 5 AND ch.total_experience < 8
        WHEN '8+'  THEN ch.total_experience >= 8
        ELSE TRUE
      END
    );

  -- ── 2. Paginated candidate list ───────────────────────────────
  SELECT jsonb_agg(row)
  INTO   v_candidates
  FROM (
    SELECT jsonb_build_object(
      'candidate_id',      ch.candidate_id,
      'jd_id',             ch.jd_id,
      'full_name',         ch.full_name,
      'email',             ch.email,
      'phone',             ch.phone,
      'location',          ch.location,
      'current_job_title', ch.current_job_title,
      'current_company',   ch.current_company,
      'total_experience',  ch.total_experience,
      'technical_skills',  COALESCE(sk.technical_skills, '[]'::JSONB),
      'degree',            ed.degree,
      'final_score',       sc.final_score,
      'verdict',           sc.verdict
    ) AS row
    FROM mechsoft.tbl_candidates_header ch

    LEFT JOIN (
      SELECT   candidate_id,
               jsonb_agg(skills ORDER BY skills) AS technical_skills
      FROM     mechsoft.tbl_candidate_skills
      WHERE    skill_type = 'technical'
        AND    is_deleted = FALSE
      GROUP BY candidate_id
    ) sk ON sk.candidate_id = ch.candidate_id

    LEFT JOIN (
      SELECT DISTINCT ON (candidate_id)
             candidate_id, degree
      FROM   mechsoft.tbl_candidate_education
      WHERE  is_deleted = FALSE
      ORDER  BY candidate_id, education_id DESC
    ) ed ON ed.candidate_id = ch.candidate_id

    LEFT JOIN (
      SELECT DISTINCT ON (candidate_id)
             candidate_id, final_score, verdict
      FROM   mechsoft.tbl_candidate_score_header
      WHERE  is_deleted = FALSE
      ORDER  BY candidate_id, created_date DESC
    ) sc ON sc.candidate_id = ch.candidate_id

    WHERE ch.is_deleted    = FALSE
      AND ch.upload_status = 'complete'
      AND (p_jd_id     IS NULL OR ch.jd_id     = p_jd_id)
      AND (p_status_id IS NULL OR ch.status_id = p_status_id)
      AND (
        p_search_text IS NULL
        OR ch.full_name ILIKE '%' || p_search_text || '%'
        OR ch.email     ILIKE '%' || p_search_text || '%'
      )
      AND (p_verdict IS NULL OR sc.verdict = p_verdict)
      AND (
        p_experience_range IS NULL OR
        CASE p_experience_range
          WHEN '0-1' THEN ch.total_experience >= 0 AND ch.total_experience < 1
          WHEN '1-3' THEN ch.total_experience >= 1 AND ch.total_experience < 3
          WHEN '3-5' THEN ch.total_experience >= 3 AND ch.total_experience < 5
          WHEN '5-8' THEN ch.total_experience >= 5 AND ch.total_experience < 8
          WHEN '8+'  THEN ch.total_experience >= 8
          ELSE TRUE
        END
      )
    ORDER BY ch.candidate_id DESC
    LIMIT  p_page_size
    OFFSET v_offset
  ) subq;

  -- ── 3. Summary stats (jd_id filter only) ─────────────────────
  SELECT jsonb_build_object(
    'total_candidates',  COUNT(DISTINCT ch.candidate_id),
    'strong_match',      COUNT(DISTINCT ch.candidate_id) FILTER (WHERE sc.verdict = 'Strong Match'),
    'avg_match_score',   COALESCE(ROUND(AVG(sc.final_score)::NUMERIC, 2), 0),
    'scored_candidates', COUNT(DISTINCT ch.candidate_id) FILTER (WHERE sc.candidate_id IS NOT NULL),
    'pending_scoring',   COUNT(DISTINCT ch.candidate_id) FILTER (WHERE sc.candidate_id IS NULL),
    'active_jds',        (
                           SELECT COUNT(*)
                           FROM   mechsoft.tbl_jd_header
                           WHERE  is_deleted = FALSE
                             AND  is_active  = TRUE
                         )
  )
  INTO v_summary
  FROM mechsoft.tbl_candidates_header ch
  LEFT JOIN (
    SELECT DISTINCT ON (candidate_id)
           candidate_id, final_score, verdict
    FROM   mechsoft.tbl_candidate_score_header
    WHERE  is_deleted = FALSE
    ORDER  BY candidate_id, created_date DESC
  ) sc ON sc.candidate_id = ch.candidate_id
  WHERE ch.is_deleted = FALSE
    AND (p_jd_id IS NULL OR ch.jd_id = p_jd_id);

  -- ── 4. Return combined result ─────────────────────────────────
  RETURN jsonb_build_object(
    'summary',     v_summary,
    'total_count', v_total_count,
    'candidates',  COALESCE(v_candidates, '[]'::JSONB)
  );

END;
$$;


-- ------------------------------------------------------------
-- 6. fn_add_update_candidate_score
--    BLOCK 1 (INSERT): If no score exists for the candidate,
--      inserts into tbl_candidate_score_header and
--      tbl_candidate_score_group (one row per group).
--    BLOCK 2 (UPDATE): Stub — to be implemented later.
--      Will: copy existing rows to audit tables, soft-delete
--      originals, then insert fresh rows.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_add_update_candidate_score(
  p_candidate_id    BIGINT,
  p_base_score      NUMERIC,
  p_final_score     NUMERIC,
  p_verdict         VARCHAR,
  p_score_json      JSONB,
  p_group_breakdown JSONB,
  p_created_by      INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_score_id BIGINT;
  v_score_id          BIGINT;
  v_group_key         TEXT;
  v_group_data        JSONB;
  v_status_id         BIGINT;
BEGIN
  -- Lookup 'ready' status_id for CAND_MGT module
  SELECT s.status_id INTO v_status_id
  FROM public.mst_status s
  INNER JOIN public.mst_modules m ON m.module_id = s.module_id
  WHERE m.module_code = 'CAND_MGT'
    AND s.status_code = 'ready'
  LIMIT 1;

  -- Update candidate header status to 'ready'
  UPDATE mechsoft.tbl_candidates_header
  SET    status_id     = v_status_id,
         modified_by   = p_created_by,
         modified_date = NOW()
  WHERE  candidate_id  = p_candidate_id;

  -- Check whether a score record already exists for this candidate
  SELECT score_id
  INTO v_existing_score_id
  FROM mechsoft.tbl_candidate_score_header
  WHERE candidate_id = p_candidate_id
    AND is_deleted   = FALSE
  LIMIT 1;

  -- ── BLOCK 1: First-time INSERT ──────────────────────────────
  IF v_existing_score_id IS NULL THEN

    -- 1a. Insert score header
    INSERT INTO mechsoft.tbl_candidate_score_header (
      candidate_id,
      base_score,
      final_score,
      verdict,
      score_json,
      is_deleted,
      created_by,
      created_date,
      modified_by,
      modified_date
    )
    VALUES (
      p_candidate_id,
      p_base_score,
      p_final_score,
      p_verdict,
      p_score_json,
      FALSE,
      p_created_by,
      NOW(),
      NULL,
      NULL
    )
    RETURNING score_id INTO v_score_id;

    -- 1b. Insert one row per capability group
    FOR v_group_key IN SELECT jsonb_object_keys(p_group_breakdown)
    LOOP
      v_group_data := p_group_breakdown -> v_group_key;

      INSERT INTO mechsoft.tbl_candidate_score_group (
        score_id,
        group_key,
        group_score,
        weight,
        penalty_factor,
        final_contribution,
        missing_required,
        present_required,
        optional_present,
        optional_missing,
        llm_classifications,
        is_deleted,
        created_by,
        created_date,
        modified_by,
        modified_date
      )
      VALUES (
        v_score_id,
        v_group_key,
        (v_group_data ->> 'group_score')::NUMERIC,
        (v_group_data ->> 'weight')::NUMERIC,
        (v_group_data ->> 'penalty_factor')::NUMERIC,
        (v_group_data ->> 'net_contribution')::NUMERIC,
        ARRAY(SELECT jsonb_array_elements_text(v_group_data -> 'missing_required')),
        ARRAY(SELECT jsonb_array_elements_text(v_group_data -> 'present_required')),
        ARRAY(SELECT jsonb_array_elements_text(v_group_data -> 'optional_present')),
        ARRAY(SELECT jsonb_array_elements_text(v_group_data -> 'optional_missing')),
        v_group_data -> 'llm_classifications',
        FALSE,
        p_created_by,
        NOW(),
        NULL,
        NULL
      );
    END LOOP;

  -- ── BLOCK 2: Re-score UPDATE (stub — implement later) ───────
  ELSE
    -- TODO: Copy existing score_header + score_group rows to
    --       their respective audit tables, soft-delete the
    --       originals (is_deleted = TRUE), then insert fresh
    --       rows using the same Block 1 logic above.
    NULL;
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- 7. fn_get_upload_status_by_jd
--    Returns candidates grouped by upload_status for a JD.
--    Used by the upload screen refresh button.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_upload_status_by_jd(
  p_jd_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'complete',   COALESCE(jsonb_agg(row) FILTER (WHERE upload_status = 'complete'),   '[]'::JSONB),
      'duplicate',  COALESCE(jsonb_agg(row) FILTER (WHERE upload_status = 'duplicate'),  '[]'::JSONB),
      'incomplete', COALESCE(jsonb_agg(row) FILTER (WHERE upload_status = 'incomplete'), '[]'::JSONB)
    )
    FROM (
      SELECT jsonb_build_object(
        'candidate_id',      ch.candidate_id,
        'full_name',         ch.full_name,
        'email',             ch.email,
        'phone',             ch.phone,
        'current_job_title', ch.current_job_title,
        'upload_status',     ch.upload_status,
        'status_code',       ms.status_code,
        'reason',            ch.reason,
        'file_name',         ch.resume_file_name,
        'file_path',         ch.resume_file_path,
        'created_date',      ch.created_date,
        'is_selected',       CASE
                               WHEN ch.upload_status = 'complete'
                                AND ms.status_code IN ('draft', 'ready')
                               THEN TRUE
                               ELSE FALSE
                             END
      ) AS row,
      ch.upload_status
      FROM mechsoft.tbl_candidates_header ch
      LEFT JOIN public.mst_status ms ON ms.status_id = ch.status_id
      WHERE ch.jd_id      = p_jd_id
        AND ch.is_deleted = FALSE
      ORDER BY ch.created_date DESC
    ) sub
  );
END;
$$;


-- ------------------------------------------------------------
-- fn_update_candidate_details
--    Updates email, phone and total_experience on the
--    candidate header row. Returns TRUE if row was found
--    and updated, FALSE if candidate_id does not exist.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_update_candidate_details(
  p_candidate_id     BIGINT,
  p_email            VARCHAR,
  p_phone            VARCHAR,
  p_total_experience NUMERIC,
  p_modified_by      INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE mechsoft.tbl_candidates_header
  SET
    email            = p_email,
    phone            = p_phone,
    total_experience = p_total_experience,
    modified_by      = p_modified_by,
    modified_date    = NOW()
  WHERE candidate_id = p_candidate_id
    AND is_deleted   = FALSE;

  RETURN FOUND;
END;
$$;
