-- ============================================================
-- JD Module - PostgreSQL Functions
-- Schema: mechsoft
-- ============================================================


-- ------------------------------------------------------------
-- fn_get_jd_profile_context
-- Returns the AI chat session context for a company so the JD
-- creation flow can seed itself from the company profile data.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_jd_profile_context(
  p_company_id INT
)
RETURNS TABLE(context_data JSONB)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT s.context_data
  FROM mechsoft.tbl_profile_ai_chat_session s
  WHERE s.company_id  = p_company_id
    AND s.is_deleted  = FALSE
  LIMIT 1;
END;
$$;


-- ------------------------------------------------------------
-- fn_add_update_jd
-- INSERT path  : p_jd_id IS NULL  → creates header + qa + chat
-- UPDATE path  : p_jd_id NOT NULL → updates header exp, appends
--                qa row, updates chat history
-- Returns the jd_id in both cases.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_add_update_jd(
  p_jd_id        INT,
  p_company_id   INT,
  p_job_title_id INT,
  p_seniority_id INT,
  p_min_exp      INT,
  p_max_exp      INT,
  p_session_id   VARCHAR,
  p_field_key    VARCHAR,
  p_question_text VARCHAR,
  p_answer_value JSONB,
  p_qa_history   JSONB,
  p_jd_theory    TEXT,
  p_user_id      INT
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_jd_id     INT;
  v_status_id INT;
BEGIN

  IF p_jd_id IS NULL THEN
    -- ── INSERT flow ──────────────────────────────────────────

    SELECT id INTO v_status_id
    FROM mechsoft.mst_status
    WHERE module      = 'JD'
      AND status_code = 'IN_PROGRESS'
    LIMIT 1;

    INSERT INTO mechsoft.tbl_jd_header (
      company_id,
      job_title_id,
      seniority_id,
      min_exp,
      max_exp,
      is_active,
      status_id,
      start_date,
      end_date,
      session_id,
      is_deleted,
      created_by,
      created_date,
      modified_by,
      modified_date
    ) VALUES (
      p_company_id,
      p_job_title_id,
      p_seniority_id,
      p_min_exp,
      p_max_exp,
      TRUE,
      v_status_id,
      NOW(),
      NULL,
      p_session_id,
      FALSE,
      p_user_id,
      NOW(),
      NULL,
      NULL
    )
    RETURNING id INTO v_jd_id;

    INSERT INTO mechsoft.tbl_jd_qa (
      jd_id,
      field_key,
      question_text,
      answer_value,
      is_deleted,
      created_by,
      created_date,
      modified_by,
      modified_date
    ) VALUES (
      v_jd_id,
      p_field_key,
      p_question_text,
      p_answer_value,
      FALSE,
      p_user_id,
      NOW(),
      NULL,
      NULL
    );

    INSERT INTO mechsoft.tbl_jd_ai_chat_data (
      jd_id,
      qa_history,
      jd_theory,
      field_key,
      is_deleted,
      created_by,
      created_date,
      modified_by,
      modified_date
    ) VALUES (
      v_jd_id,
      p_qa_history,
      COALESCE(p_jd_theory, ''),
      p_field_key,
      FALSE,
      p_user_id,
      NOW(),
      NULL,
      NULL
    );

  ELSE
    -- ── UPDATE flow ──────────────────────────────────────────

    v_jd_id := p_jd_id;

    UPDATE mechsoft.tbl_jd_header
    SET
      min_exp       = p_min_exp,
      max_exp       = p_max_exp,
      modified_by   = p_user_id,
      modified_date = NOW()
    WHERE id         = v_jd_id
      AND company_id = p_company_id
      AND is_deleted = FALSE;

    INSERT INTO mechsoft.tbl_jd_qa (
      jd_id,
      field_key,
      question_text,
      answer_value,
      is_deleted,
      created_by,
      created_date,
      modified_by,
      modified_date
    ) VALUES (
      v_jd_id,
      p_field_key,
      p_question_text,
      p_answer_value,
      FALSE,
      p_user_id,
      NOW(),
      NULL,
      NULL
    );

    UPDATE mechsoft.tbl_jd_ai_chat_data
    SET
      qa_history    = p_qa_history,
      field_key     = p_field_key,
      modified_by   = p_user_id,
      modified_date = NOW()
    WHERE jd_id      = v_jd_id
      AND is_deleted = FALSE;

  END IF;

  RETURN v_jd_id;
END;
$$;


-- ------------------------------------------------------------
-- fn_finalize_jd
-- Called once the FINAL_QUESTION answer is processed.
-- Saves the AI-generated theory and marks the JD as COMPLETED.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_finalize_jd(
  p_jd_id    INT,
  p_jd_theory TEXT,
  p_user_id  INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_status_id INT;
BEGIN

  UPDATE mechsoft.tbl_jd_ai_chat_data
  SET
    jd_theory     = p_jd_theory,
    modified_by   = p_user_id,
    modified_date = NOW()
  WHERE jd_id      = p_jd_id
    AND is_deleted = FALSE;

  SELECT id INTO v_status_id
  FROM mechsoft.mst_status
  WHERE module      = 'JD'
    AND status_code = 'COMPLETED'
  LIMIT 1;

  UPDATE mechsoft.tbl_jd_header
  SET
    status_id     = v_status_id,
    modified_by   = p_user_id,
    modified_date = NOW()
  WHERE id         = p_jd_id
    AND is_deleted = FALSE;

END;
$$;


-- ------------------------------------------------------------
-- fn_get_all_jds
-- Returns all JDs for a company with joined lookup labels.
-- job_title_id and seniority_id are optional filters.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_all_jds(
  p_company_id   INT,
  p_job_title_id INT DEFAULT NULL,
  p_seniority_id INT DEFAULT NULL
)
RETURNS TABLE (
  jd_id        INT,
  job_title    VARCHAR,
  seniority    VARCHAR,
  min_exp      INT,
  max_exp      INT,
  is_active    BOOLEAN,
  status_name  VARCHAR,
  status_id    INT,
  start_date   TIMESTAMP,
  end_date     TIMESTAMP
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.id                  AS jd_id,
    jt.title              AS job_title,
    s.name                AS seniority,
    h.min_exp,
    h.max_exp,
    h.is_active,
    st.status_name        AS status_name,
    h.status_id,
    h.start_date,
    h.end_date
  FROM  mechsoft.tbl_jd_header  h
  LEFT JOIN public.mst_jobtitle  jt ON jt.id        = h.job_title_id
  LEFT JOIN public.mst_seniority s  ON s.id         = h.seniority_id
  LEFT JOIN public.mst_status    st ON st.status_id = h.status_id
  WHERE h.company_id  = p_company_id
    AND h.is_deleted  = FALSE
    AND (p_job_title_id IS NULL OR h.job_title_id = p_job_title_id)
    AND (p_seniority_id IS NULL OR h.seniority_id = p_seniority_id)
  ORDER BY h.start_date DESC;
END;
$$;
