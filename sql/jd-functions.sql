-- ============================================================
-- JD Module - PostgreSQL Functions
-- Schema: mechsoft
-- ============================================================

-- Run once: schema migrations
ALTER TABLE mechsoft.tbl_jd_qa
  ADD COLUMN IF NOT EXISTS mode VARCHAR;

CREATE TABLE IF NOT EXISTS mechsoft.tbl_jd_qa_audit (
  audit_id      SERIAL PRIMARY KEY,
  original_id   INT,
  jd_id         INT,
  field_key     VARCHAR,
  question_text TEXT,
  answer_value  JSONB,
  mode          VARCHAR,
  is_deleted    BOOLEAN,
  created_by    INT,
  created_date  TIMESTAMP,
  modified_by   INT,
  modified_date TIMESTAMP,
  audit_by      INT,
  audit_date    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mechsoft.tbl_jd_weightage_header (
  weightage_id  SERIAL PRIMARY KEY,
  jd_id         INT            NOT NULL REFERENCES mechsoft.tbl_jd_header(jd_id),
  weightage_json JSONB
);

CREATE TABLE IF NOT EXISTS mechsoft.tbl_jd_weightage_Capability (
  id            SERIAL PRIMARY KEY,
  weightage_id  INT            NOT NULL REFERENCES mechsoft.tbl_jd_weightage_header(weightage_id),
  capability    VARCHAR,
  weight        DECIMAL(5, 2),
  required      TEXT[],
  optional      TEXT[],
  description   VARCHAR,
  is_deleted    BOOLEAN        DEFAULT FALSE
);

ALTER TABLE mechsoft.tbl_jd_weightage_Capability
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS mechsoft.tbl_jd_weightage_Capability_Audit (
  audit_id      SERIAL PRIMARY KEY,
  id            INT,
  weightage_id  INT,
  capability    VARCHAR,
  weight        DECIMAL(5, 2),
  required      TEXT[],
  optional      TEXT[],
  description   VARCHAR
);


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
-- UPDATE path  : p_jd_id NOT NULL →
--   ORG_DNA_CONFIRMATION mode : archive existing qa row to audit,
--                               update answer in place (no new row)
--   Normal mode               : append new qa row, update header exp
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
  p_answer_value TEXT[],
  p_qa_history   JSONB,
  p_jd_theory    TEXT,
  p_user_id      INT,
  p_mode         VARCHAR DEFAULT NULL,
  p_work_model   TEXT    DEFAULT NULL
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

    SELECT st.status_id INTO v_status_id
    FROM public.mst_status st
    INNER JOIN public.mst_modules md ON md.module_id = st.module_id
    WHERE md.module_code = 'JD_MODULE'
      AND st.status_name = 'In_Progress'
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
      work_model,
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
      p_work_model,
      FALSE,
      p_user_id,
      NOW(),
      NULL,
      NULL
    )
    RETURNING jd_id INTO v_jd_id;

    INSERT INTO mechsoft.tbl_jd_qa (
      jd_id,
      field_key,
      question_text,
      answer_value,
      mode,
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
      p_mode,
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
      work_model    = COALESCE(p_work_model, work_model),
      modified_by   = p_user_id,
      modified_date = NOW()
    WHERE jd_id      = v_jd_id
      AND company_id = p_company_id
      AND is_deleted = FALSE;

    IF p_mode = 'ORG_DNA_CONFIRMATION' THEN
      -- ── ORG_DNA_CONFIRMATION: archive existing row, then update answer ──

      INSERT INTO mechsoft.tbl_jd_qa_audit (
        jd_id,
        field_key,
        question_text,
        answer_value,
        mode,
        is_deleted,
        created_by,
        created_date,
        modified_by,
        modified_date,
        audit_by,
        audit_date
      )
      SELECT
        jd_id,
        field_key,
        question_text,
        answer_value,
        mode,
        is_deleted,
        created_by,
        created_date,
        modified_by,
        modified_date,
        p_user_id,
        NOW()
      FROM mechsoft.tbl_jd_qa
      WHERE jd_id    = v_jd_id
        AND field_key = p_field_key
        AND is_deleted = FALSE;

      UPDATE mechsoft.tbl_jd_qa
      SET
        answer_value  = p_answer_value,
        modified_by   = p_user_id,
        modified_date = NOW()
      WHERE jd_id     = v_jd_id
        AND field_key  = p_field_key
        AND is_deleted = FALSE;

    ELSE
      -- ── Normal: update existing row if found, else insert ────

      IF p_mode IN ('clarification', 'crossfield') THEN

        -- Clarification / crossfield: always insert a new row
        INSERT INTO mechsoft.tbl_jd_qa (
          jd_id, field_key, question_text,
          answer_value, mode, is_deleted,
          created_by, created_date, modified_by, modified_date
        ) VALUES (
          v_jd_id, p_field_key, p_question_text,
          p_answer_value, p_mode, FALSE,
          p_user_id, NOW(), NULL, NULL
        );

      ELSIF EXISTS (
        SELECT 1 FROM mechsoft.tbl_jd_qa
        WHERE jd_id    = v_jd_id
          AND field_key = p_field_key
          AND is_deleted = FALSE
      ) THEN

        -- Initial mode + row exists (resume): archive then update
        INSERT INTO mechsoft.tbl_jd_qa_audit (
          jd_id, field_key, question_text,
          answer_value, mode, is_deleted,
          created_by, created_date, modified_by, modified_date,
          audit_by, audit_date
        )
        SELECT
          jd_id, field_key, question_text,
          answer_value, mode, is_deleted,
          created_by, created_date, modified_by, modified_date,
          p_user_id, NOW()
        FROM mechsoft.tbl_jd_qa
        WHERE jd_id    = v_jd_id
          AND field_key = p_field_key
          AND is_deleted = FALSE;

        UPDATE mechsoft.tbl_jd_qa
        SET
          answer_value  = p_answer_value,
          modified_by   = p_user_id,
          modified_date = NOW()
        WHERE jd_id     = v_jd_id
          AND field_key  = p_field_key
          AND is_deleted = FALSE;

      ELSE

        -- Initial mode + no row: insert new
        INSERT INTO mechsoft.tbl_jd_qa (
          jd_id, field_key, question_text,
          answer_value, mode, is_deleted,
          created_by, created_date, modified_by, modified_date
        ) VALUES (
          v_jd_id, p_field_key, p_question_text,
          p_answer_value, p_mode, FALSE,
          p_user_id, NOW(), NULL, NULL
        );

      END IF;

    END IF;

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
  end_date     TIMESTAMP,
  work_model   TEXT
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
    h.end_date,
    h.work_model
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


-- ------------------------------------------------------------
-- fn_get_jd_counts
-- Returns summary counts for a company's JD landing screen.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_jd_counts(
  p_company_id INT
)
RETURNS TABLE (
  total_jds       BIGINT,
  added_this_week BIGINT,
  remote_roles    BIGINT,
  hybrid_roles    BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)                                                          AS total_jds,
    COUNT(*) FILTER (WHERE h.start_date >= DATE_TRUNC('week', NOW())) AS added_this_week,
    COUNT(*) FILTER (WHERE LOWER(h.work_model) = 'remote')           AS remote_roles,
    COUNT(*) FILTER (WHERE LOWER(h.work_model) = 'hybrid')           AS hybrid_roles
  FROM mechsoft.tbl_jd_header h
  WHERE h.company_id = p_company_id
    AND h.is_deleted = FALSE;
END;
$$;


-- ------------------------------------------------------------
-- fn_get_jd_details_by_id
-- Returns Q&A rows for the given JD plus header-level context.
-- session_id               : from tbl_jd_header
-- field_values / field_progress / question_counts
--                          : extracted from tbl_jd_ai_chat_data.qa_history JSONB
--                            (Python answer response stored there each round)
-- If In_Progress → jd_theory NULL.   If Completed → jd_theory populated.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_jd_details_by_id(
  p_jd_id INT
)
RETURNS TABLE (
  jd_id          INT,
  job_title_id   INT,
  seniority_id   INT,
  job_title      TEXT,
  session_id     VARCHAR,
  status_name    VARCHAR,
  theory         TEXT,
  data_blob      JSONB,
  weightage_json JSONB,
  is_weightage   BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.jd_id,
    h.job_title_id,
    h.seniority_id,
    CONCAT(s.name, ' ', jt.title)    AS job_title,
    h.session_id,
    st.status_name,
    CASE WHEN st.status_name = 'Completed' THEN d.jd_theory
         ELSE NULL
    END                              AS theory,
    d.qa_history                     AS data_blob,
    (w.weightage_json -> 'weights')  AS weightage_json,
    (w.weightage_id IS NOT NULL)     AS is_weightage
  FROM  mechsoft.tbl_jd_header h
  INNER JOIN public.mst_status st
          ON st.status_id  = h.status_id
  LEFT  JOIN public.mst_jobtitle jt
          ON jt.id         = h.job_title_id
  LEFT  JOIN public.mst_seniority s
          ON s.id          = h.seniority_id
  LEFT  JOIN mechsoft.tbl_jd_ai_chat_data d
          ON d.jd_id       = h.jd_id
         AND d.is_deleted  = FALSE
  LEFT  JOIN mechsoft.tbl_jd_weightage_header w
          ON w.jd_id       = h.jd_id
  WHERE h.jd_id      = p_jd_id
    AND h.is_deleted = FALSE
  LIMIT 1;
END;
$$;


-- ------------------------------------------------------------
-- fn_edit_jd_qa_answer
-- Selects the latest row for the given field_key (by id DESC),
-- archives it to audit, then updates answer_value by id.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_edit_jd_qa_answer(
  p_jd_id      INT,
  p_field_key  VARCHAR,
  p_new_answer TEXT[],
  p_user_id    INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_qa_id INT;
BEGIN

  -- Pick the latest row for this field_key (no mode filter)
  SELECT id INTO v_qa_id
  FROM mechsoft.tbl_jd_qa
  WHERE jd_id      = p_jd_id
    AND field_key  = p_field_key
    AND is_deleted = FALSE
  ORDER BY id DESC
  LIMIT 1;

  IF v_qa_id IS NULL THEN
    RETURN;
  END IF;

  -- Archive before update
  INSERT INTO mechsoft.tbl_jd_qa_audit (
    jd_id, field_key, question_text,
    answer_value, mode, is_deleted,
    created_by, created_date, modified_by, modified_date,
    audit_by, audit_date
  )
  SELECT
     jd_id, field_key, question_text,
    answer_value, mode, is_deleted,
    created_by, created_date, modified_by, modified_date,
    p_user_id, NOW()
  FROM mechsoft.tbl_jd_qa
  WHERE id = v_qa_id;

  -- Update the selected row
  UPDATE mechsoft.tbl_jd_qa
  SET
    answer_value  = p_new_answer,
    modified_by   = p_user_id,
    modified_date = NOW()
  WHERE id = v_qa_id;

  -- If work_model was edited, sync to header table as well
  IF p_field_key = 'work_model' THEN
    UPDATE mechsoft.tbl_jd_header
    SET
      work_model    = p_new_answer[1],
      modified_by   = p_user_id,
      modified_date = NOW()
    WHERE jd_id      = p_jd_id
      AND is_deleted = FALSE;
  END IF;

END;
$$;


-- ------------------------------------------------------------
-- fn_delete_jd
-- Checks if this JD is referenced by any candidate in
-- tbl_candidates_header. If yes → returns FALSE (blocked).
-- If no → soft-deletes tbl_jd_header, tbl_jd_qa,
-- tbl_jd_ai_chat_data, and tbl_jd_weightage_Capability,
-- then returns TRUE.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_delete_jd(
  p_jd_id   INT,
  p_user_id INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_candidate_count INT;
BEGIN

  SELECT COUNT(*) INTO v_candidate_count
  FROM mechsoft.tbl_candidates_header
  WHERE jd_id      = p_jd_id
    AND is_deleted = FALSE;

  IF v_candidate_count > 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE mechsoft.tbl_jd_header
  SET
    is_deleted    = TRUE,
    modified_by   = p_user_id,
    modified_date = NOW()
  WHERE jd_id      = p_jd_id
    AND is_deleted = FALSE;

  UPDATE mechsoft.tbl_jd_qa
  SET
    is_deleted    = TRUE,
    modified_by   = p_user_id,
    modified_date = NOW()
  WHERE jd_id      = p_jd_id
    AND is_deleted = FALSE;

  UPDATE mechsoft.tbl_jd_ai_chat_data
  SET
    is_deleted    = TRUE,
    modified_by   = p_user_id,
    modified_date = NOW()
  WHERE jd_id      = p_jd_id
    AND is_deleted = FALSE;

  UPDATE mechsoft.tbl_jd_weightage_Capability c
  SET    is_deleted  = TRUE
  FROM   mechsoft.tbl_jd_weightage_header h
  WHERE  h.jd_id        = p_jd_id
    AND  c.weightage_id = h.weightage_id
    AND  c.is_deleted   = FALSE;

  RETURN TRUE;
END;
$$;


-- ------------------------------------------------------------
-- fn_update_jd_theory
-- For each modified field: archives the qa row to audit, then
-- updates answer_value in tbl_jd_qa.
-- Then updates jd_theory and merges updated_field_values into
-- the field_values object inside tbl_jd_ai_chat_data.qa_history.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_update_jd_theory(
  p_jd_id                INT,
  p_rendered_text        TEXT,
  p_modified_fields      TEXT[],
  p_updated_field_values JSONB,
  p_user_id              INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_field_key TEXT;
BEGIN

  FOREACH v_field_key IN ARRAY p_modified_fields
  LOOP
    -- Archive before update
    INSERT INTO mechsoft.tbl_jd_qa_audit (
      original_id,
      jd_id,
      field_key,
      question_text,
      answer_value,
      mode,
      is_deleted,
      created_by,
      created_date,
      modified_by,
      modified_date,
      audit_by,
      audit_date
    )
    SELECT
      id,
      jd_id,
      field_key,
      question_text,
      answer_value,
      mode,
      is_deleted,
      created_by,
      created_date,
      modified_by,
      modified_date,
      p_user_id,
      NOW()
    FROM mechsoft.tbl_jd_qa
    WHERE jd_id      = p_jd_id
      AND field_key  = v_field_key
      AND is_deleted = FALSE;

    -- Update answer in place
    UPDATE mechsoft.tbl_jd_qa
    SET
      answer_value  = p_updated_field_values ->> v_field_key,
      modified_by   = p_user_id,
      modified_date = NOW()
    WHERE jd_id      = p_jd_id
      AND field_key  = v_field_key
      AND is_deleted = FALSE;
  END LOOP;

  -- Update jd_theory and merge updated field values into qa_history
  UPDATE mechsoft.tbl_jd_ai_chat_data
  SET
    jd_theory     = p_rendered_text,
    qa_history    = jsonb_set(
                      COALESCE(qa_history, '{}'),
                      '{field_values}',
                      COALESCE(qa_history -> 'field_values', '{}') || p_updated_field_values
                    ),
    modified_by   = p_user_id,
    modified_date = NOW()
  WHERE jd_id      = p_jd_id
    AND is_deleted = FALSE;

END;
$$;


-- ------------------------------------------------------------
-- fn_add_update_jd_weightage
-- INSERT path  : no existing header for this jd_id
--                → insert header + insert capabilities
-- UPDATE path  : header already exists
--                → archive old capabilities to audit,
--                  delete them, insert new ones, update header
-- Returns weightage_id in both cases.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_add_update_jd_weightage(
  p_jd_id          INT,
  p_weightage_json JSONB,
  p_capabilities   JSONB,
  p_user_id        INT
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_weightage_id INT;
  v_cap          JSONB;
BEGIN

  SELECT weightage_id INTO v_weightage_id
  FROM mechsoft.tbl_jd_weightage_header
  WHERE jd_id = p_jd_id
  LIMIT 1;

  IF v_weightage_id IS NULL THEN
    -- ── INSERT flow ──────────────────────────────────────────

    INSERT INTO mechsoft.tbl_jd_weightage_header (jd_id, weightage_json)
    VALUES (p_jd_id, p_weightage_json)
    RETURNING weightage_id INTO v_weightage_id;

  ELSE
    -- ── UPDATE flow ──────────────────────────────────────────

    UPDATE mechsoft.tbl_jd_weightage_header
    SET weightage_json = p_weightage_json
    WHERE weightage_id = v_weightage_id;

    -- Archive active capabilities before replacing them (temporarily disabled)
    -- INSERT INTO mechsoft.tbl_jd_weightage_Capability_Audit (
    --   id,
    --   weightage_id,
    --   capability,
    --   weight,
    --   required,
    --   optional,
    --   description
    -- )
    -- SELECT
    --   id,
    --   weightage_id,
    --   capability,
    --   weight,
    --   required,
    --   optional,
    --   description
    -- FROM mechsoft.tbl_jd_weightage_Capability
    -- WHERE weightage_id = v_weightage_id
    --   AND is_deleted   = FALSE;

    -- Soft delete existing capabilities
    UPDATE mechsoft.tbl_jd_weightage_Capability
    SET    is_deleted  = TRUE
    WHERE  weightage_id = v_weightage_id
      AND  is_deleted   = FALSE;

  END IF;

  -- Insert new capabilities
  FOR v_cap IN SELECT * FROM jsonb_array_elements(p_capabilities)
  LOOP
    INSERT INTO mechsoft.tbl_jd_weightage_Capability (
      weightage_id,
      capability,
      weight,
      required,
      optional,
      description,
      is_deleted
    ) VALUES (
      v_weightage_id,
      v_cap ->> 'capability',
      (v_cap ->> 'weight')::DECIMAL,
      ARRAY(SELECT jsonb_array_elements_text(v_cap -> 'required')),
      ARRAY(SELECT jsonb_array_elements_text(v_cap -> 'optional')),
      v_cap ->> 'description',
      FALSE
    );
  END LOOP;

  RETURN v_weightage_id;
END;
$$;


-- ------------------------------------------------------------
-- fn_update_jd_qa_history
-- Called after update-field/respond completes.
-- For a given field_key + new_value:
--   1. Updates field_values.{field_key} inside qa_history JSONB
--   2. Updates raw_answer for all interactions matching field_key
--      (no mode filter — follows company profile pattern)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_update_jd_qa_history(
  p_jd_id     INT,
  p_field_key VARCHAR,
  p_new_value JSONB,
  p_user_id   INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE mechsoft.tbl_jd_ai_chat_data
  SET
    qa_history = jsonb_set(
      jsonb_set(
        qa_history,
        '{field_values}',
        COALESCE(qa_history -> 'field_values', '{}') || jsonb_build_object(p_field_key, p_new_value)
      ),
      '{interactions}',
      COALESCE(
        (
          SELECT jsonb_agg(
            CASE
              WHEN elem ->> 'field_key' = p_field_key
              THEN jsonb_set(elem, '{raw_answer}', p_new_value)
              ELSE elem
            END
          )
          FROM jsonb_array_elements(qa_history -> 'interactions') AS elem
        ),
        '[]'::jsonb
      )
    ),
    modified_by   = p_user_id,
    modified_date = NOW()
  WHERE jd_id      = p_jd_id
    AND is_deleted = FALSE;
END;
$$;


-- ------------------------------------------------------------
-- fn_save_jd_edit_theory
-- Called after the update_theory Python API responds.
-- 1. Always updates jd_theory with the new rendered_text.
-- 2. If modified_fields is empty → stops (theory-only update).
-- 3. For each modified field_key:
--    a. Updates field_values.{field_key} in qa_history JSONB.
--    b. Updates raw_answer in the interactions array:
--       - If clarification mode entry exists → update that one.
--       - Else → update the initial mode entry.
--    c. Archives the matching tbl_jd_qa row to audit, then updates
--       answer_value using the same clarification-first logic.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_save_jd_edit_theory(
  p_jd_id                INT,
  p_rendered_text        TEXT,
  p_modified_fields      TEXT[],
  p_updated_field_values JSONB,
  p_user_id              INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_field_key         TEXT;
  v_new_value         JSONB;
  v_answer_array      TEXT[];
  v_has_clarification BOOLEAN;
BEGIN

  -- 1. Always update jd_theory
  UPDATE mechsoft.tbl_jd_ai_chat_data
  SET
    jd_theory     = p_rendered_text,
    modified_by   = p_user_id,
    modified_date = NOW()
  WHERE jd_id      = p_jd_id
    AND is_deleted = FALSE;

  -- 2. If no modified fields, stop here
  IF p_modified_fields IS NULL OR array_length(p_modified_fields, 1) IS NULL THEN
    RETURN;
  END IF;

  -- 3. Process each modified field
  FOREACH v_field_key IN ARRAY p_modified_fields
  LOOP
    v_new_value := p_updated_field_values -> v_field_key;

    -- ── tbl_jd_ai_chat_data: field_values + interactions ────────────────

    -- Check if a clarification-mode interaction exists for this field_key
    SELECT EXISTS (
      SELECT 1
      FROM mechsoft.tbl_jd_ai_chat_data d,
           jsonb_array_elements(d.qa_history -> 'interactions') AS elem
      WHERE d.jd_id            = p_jd_id
        AND d.is_deleted       = FALSE
        AND elem ->> 'field_key' = v_field_key
        AND elem ->> 'mode'      = 'clarification'
    ) INTO v_has_clarification;

    UPDATE mechsoft.tbl_jd_ai_chat_data
    SET
      qa_history = jsonb_set(
        jsonb_set(
          qa_history,
          '{field_values}',
          COALESCE(qa_history -> 'field_values', '{}')
          || jsonb_build_object(v_field_key, v_new_value)
        ),
        '{interactions}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN elem ->> 'field_key' = v_field_key
                  AND (
                    ( v_has_clarification AND elem ->> 'mode' = 'clarification') OR
                    (NOT v_has_clarification AND elem ->> 'mode' = 'initial')
                  )
                THEN jsonb_set(elem, '{raw_answer}', v_new_value)
                ELSE elem
              END
            )
            FROM jsonb_array_elements(qa_history -> 'interactions') AS elem
          ),
          '[]'::jsonb
        )
      ),
      modified_by   = p_user_id,
      modified_date = NOW()
    WHERE jd_id      = p_jd_id
      AND is_deleted = FALSE;

    -- ── tbl_jd_qa: archive then update ──────────────────────────────────

    -- Check if a clarification-mode row exists in tbl_jd_qa
    SELECT EXISTS (
      SELECT 1 FROM mechsoft.tbl_jd_qa
      WHERE jd_id      = p_jd_id
        AND field_key  = v_field_key
        AND mode       = 'clarification'
        AND is_deleted = FALSE
    ) INTO v_has_clarification;

    -- Convert JSONB value → TEXT[] for answer_value column
    IF jsonb_typeof(v_new_value) = 'array' THEN
      v_answer_array := ARRAY(SELECT jsonb_array_elements_text(v_new_value));
    ELSE
      v_answer_array := ARRAY[v_new_value #>> '{}'];
    END IF;

    -- Archive matching row before update
    INSERT INTO mechsoft.tbl_jd_qa_audit (
      original_id, jd_id, field_key, question_text,
      answer_value, mode, is_deleted,
      created_by, created_date, modified_by, modified_date,
      audit_by, audit_date
    )
    SELECT
      id, jd_id, field_key, question_text,
      answer_value, mode, is_deleted,
      created_by, created_date, modified_by, modified_date,
      p_user_id, NOW()
    FROM mechsoft.tbl_jd_qa
    WHERE jd_id      = p_jd_id
      AND field_key  = v_field_key
      AND is_deleted = FALSE
      AND (
        ( v_has_clarification AND mode = 'clarification') OR
        (NOT v_has_clarification AND mode = 'initial')
      );

    -- Update answer_value
    UPDATE mechsoft.tbl_jd_qa
    SET
      answer_value  = v_answer_array,
      modified_by   = p_user_id,
      modified_date = NOW()
    WHERE jd_id      = p_jd_id
      AND field_key  = v_field_key
      AND is_deleted = FALSE
      AND (
        ( v_has_clarification AND mode = 'clarification') OR
        (NOT v_has_clarification AND mode = 'initial')
      );

  END LOOP;

END;
$$;
