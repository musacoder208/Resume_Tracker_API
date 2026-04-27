-- =============================================================
-- Company Profile Module — PostgreSQL Functions
-- Schema: mechsoft (profile tables) | public (RBAC check)
-- Run this script once against your target database.
-- Column naming follows snake_case (PostgreSQL unquoted default).
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. RBAC: check if a role is Admin for a given company
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_is_admin_role(
    p_role_id    INT,
    p_company_id INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM   public.tbl_roles
        WHERE  role_id    = p_role_id
          AND  company_id = p_company_id
          AND  LOWER(role_name) = 'admin'
         -- AND  is_active  = TRUE
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 1b. Look up status_id by module name + status name
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_module_status_id(
    p_module_name VARCHAR,
    p_status_name VARCHAR
)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_status_id INT;
BEGIN
    SELECT s.status_id
    INTO   v_status_id
    FROM   public.mst_status  s
    JOIN   public.mst_modules m ON m.module_id = s.module_id
    WHERE  m.module_name = p_module_name
      AND  s.status_name = p_status_name
      AND  s.is_deleted  = FALSE
    LIMIT  1;

    RETURN v_status_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2. Get profile header by company
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_get_profile_header(
    p_company_id INT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT JSON_BUILD_OBJECT(
        'ProfileHeaderId', ph."ProfileHeaderId",
        'company_id',        ph.company_id,
        'status_id',         ph.status_id,
        'is_completed',      ph.is_completed,
        'is_deleted',        ph.is_deleted,
        'created_by',        ph.created_by,
        'created_date',      ph.created_date,
        'modified_by',       ph.modified_by,
        'modified_date',     ph.modified_date
    )
    INTO v_result
    FROM mechsoft.company_profile_header ph
    WHERE ph.company_id = p_company_id
      AND ph.is_deleted = FALSE;

    RETURN v_result;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 3. Create profile header (idempotency enforced in Node.js)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_create_profile_header(
    p_company_id INT,
    p_status_id  INT,
    p_created_by INT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSON;
BEGIN
    INSERT INTO mechsoft.company_profile_header (
        company_id,
        status_id,
        is_completed,
        is_deleted,
        created_by,
        created_date,
        modified_by,
        modified_date
    )
    VALUES (
        p_company_id,
        p_status_id,
        FALSE,
        FALSE,
        p_created_by,
        NOW(),
        NULL,
        NULL
    );

    SELECT mechsoft.fn_get_profile_header(p_company_id) INTO v_result;
    RETURN v_result;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4. Mark profile header as completed
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_complete_profile_header(
    p_company_id  INT,
    p_status_id   INT,
    p_modified_by INT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSON;
BEGIN
    UPDATE mechsoft.company_profile_header
    SET    is_completed  = TRUE,
           status_id     = p_status_id,
           modified_by   = p_modified_by,
           modified_date = NOW()
    WHERE  company_id = p_company_id
      AND  is_deleted = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile header not found for company_id: %', p_company_id;
    END IF;

    SELECT mechsoft.fn_get_profile_header(p_company_id) INTO v_result;
    RETURN v_result;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4b. Set is_completed = TRUE on profile header (no status change)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_set_profile_completed(
    p_company_id  INT,
    p_modified_by INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE mechsoft.company_profile_header
    SET    is_completed  = TRUE,
           modified_by   = p_modified_by,
           modified_date = NOW()
    WHERE  company_id = p_company_id
      AND  is_deleted  = FALSE;

    RETURN FOUND;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 5. Upsert AI chat session (one active session per company)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_upsert_chat_session(
    p_company_id   INT,
    p_field_key    VARCHAR,
    p_context_data JSONB,
    p_created_by   INT,
    p_modified_by  INT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_id     INT;
    v_result JSON;
BEGIN
    SELECT id
    INTO   v_id
    FROM   mechsoft.tbl_profile_ai_chat_session
    WHERE  company_id = p_company_id
      AND  is_deleted = FALSE
    LIMIT  1;

    IF v_id IS NOT NULL THEN
        UPDATE mechsoft.tbl_profile_ai_chat_session
        SET    context_data  = p_context_data,
               field_key     = p_field_key,
               modified_by   = p_modified_by,
               modified_date = NOW()
        WHERE  id = v_id;
    ELSE
        INSERT INTO mechsoft.tbl_profile_ai_chat_session (
            company_id,
            context_data,
            field_key,
            is_deleted,
            created_by,
            created_date,
            modified_by,
            modified_date
        )
        VALUES (
            p_company_id,
            p_context_data,
            p_field_key,
            FALSE,
            p_created_by,
            NOW(),
            NULL,
            NULL
        )
        RETURNING id INTO v_id;
    END IF;

    SELECT JSON_BUILD_OBJECT(
        'id',            s.id,
        'company_id',    s.company_id,
        'field_key',     s.field_key,
        'context_data',  s.context_data,
        'created_date',  s.created_date,
        'modified_date', s.modified_date
    )
    INTO v_result
    FROM mechsoft.tbl_profile_ai_chat_session s
    WHERE s.id = v_id;

    RETURN v_result;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 6. Get active (non-deleted) chat session for a company
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_get_active_chat_session(
    p_company_id INT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT JSON_BUILD_OBJECT(
        'id',            s.id,
        'company_id',    s.company_id,
        'field_key',     s.field_key,
        'context_data',  s.context_data,
        'created_date',  s.created_date,
        'modified_date', s.modified_date
    )
    INTO v_result
    FROM mechsoft.tbl_profile_ai_chat_session s
    WHERE s.company_id = p_company_id
      AND s.is_deleted = FALSE
    ORDER BY COALESCE(s.modified_date, s.created_date) DESC
    LIMIT 1;

    RETURN v_result;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 7. Upsert profile Q&A record (by field_key)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_upsert_profile_qa(
    p_company_id    INT,
    p_field_key     VARCHAR,
    p_question_text VARCHAR,
    p_answer_value  JSONB,
    p_created_by    INT,
    p_modified_by   INT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_id     INT;
    v_result JSON;
BEGIN
    SELECT id
    INTO   v_id
    FROM   mechsoft.tbl_profile_qa
    WHERE  company_id = p_company_id
      AND  field_key  = p_field_key
      AND  is_deleted = FALSE;

    IF v_id IS NOT NULL THEN
        UPDATE mechsoft.tbl_profile_qa
        SET    answer_value  = p_answer_value,
               question_text = p_question_text,
               modified_by   = p_modified_by,
               modified_date = NOW()
        WHERE  id = v_id;
    ELSE
        INSERT INTO mechsoft.tbl_profile_qa (
            company_id,
            field_key,
            question_text,
            answer_value,
            is_deleted,
            created_by,
            created_date,
            modified_by,
            modified_date
        )
        VALUES (
            p_company_id,
            p_field_key,
            p_question_text,
            p_answer_value,
            FALSE,
            p_created_by,
            NOW(),
            NULL,
            NULL
        )
        RETURNING id INTO v_id;
    END IF;

    SELECT JSON_BUILD_OBJECT(
        'id',            q.id,
        'company_id',    q.company_id,
        'field_key',     q.field_key,
        'question_text', q.question_text,
        'answer_value',  q.answer_value
    )
    INTO v_result
    FROM mechsoft.tbl_profile_qa q
    WHERE q.id = v_id;

    RETURN v_result;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 8. Get all Q&A records for a company
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_get_profile_qa(
    p_company_id INT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
            'id',            q.id,
            'field_key',     q.field_key,
            'question_text', q.question_text,
            'answer_value',  q.answer_value,
            'created_date',  q.created_date,
            'modified_date', q.modified_date
        )
        ORDER BY q.id
    )
    INTO v_result
    FROM mechsoft.tbl_profile_qa q
    WHERE q.company_id = p_company_id
      AND q.is_deleted = FALSE;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 9. Get single Q&A record by field_key
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_get_profile_qa_by_field(
    p_company_id INT,
    p_field_key  VARCHAR
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT JSON_BUILD_OBJECT(
        'id',            q.id,
        'field_key',     q.field_key,
        'question_text', q.question_text,
        'answer_value',  q.answer_value
    )
    INTO v_result
    FROM mechsoft.tbl_profile_qa q
    WHERE q.company_id = p_company_id
      AND q.field_key  = p_field_key
      AND q.is_deleted = FALSE;

    RETURN v_result;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 10. Bulk update Q&A + insert audit records + update session
--     All three operations run atomically within this function.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_bulk_update_profile_with_audit(
    p_company_id    INT,
    p_changes       JSONB,    -- [{field_key, after:{value}}]
    p_change_reason VARCHAR,
    p_context_data  JSONB,
    p_modified_by   INT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_change     JSONB;
    v_qa_id      INT;
    v_old_answer JSONB;
    v_field_key  VARCHAR;
    v_new_answer JSONB;
    v_result     JSON;
BEGIN
    FOR v_change IN
        SELECT value FROM jsonb_array_elements(p_changes)
    LOOP
        v_field_key  := v_change->>'field_key';
        v_new_answer := v_change->'after';

        SELECT id, answer_value
        INTO   v_qa_id, v_old_answer
        FROM   mechsoft.tbl_profile_qa
        WHERE  company_id = p_company_id
          AND  field_key  = v_field_key
          AND  is_deleted = FALSE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'QA record not found for field_key: %', v_field_key;
        END IF;

        -- Update QA answer
        UPDATE mechsoft.tbl_profile_qa
        SET    answer_value  = v_new_answer,
               modified_by   = p_modified_by,
               modified_date = NOW()
        WHERE  id = v_qa_id;

        -- Insert audit trail (old answer preserved)
        INSERT INTO mechsoft.tbl_profile_qa_audit (
            qa_id,
            company_id,
            answer_value,
            change_reason,
            is_deleted,
            created_by,
            created_date,
            modified_by,
            modified_date
        )
        VALUES (
            v_qa_id,
            p_company_id,
            v_old_answer,
            p_change_reason,
            FALSE,
            p_modified_by,
            NOW(),
            NULL,
            NULL
        );
    END LOOP;

    -- Update chat session to latest AI state
    UPDATE mechsoft.tbl_profile_ai_chat_session
    SET    context_data  = p_context_data,
           modified_by   = p_modified_by,
           modified_date = NOW()
    WHERE  company_id = p_company_id
      AND  is_deleted = FALSE;

    v_result := JSON_BUILD_OBJECT(
        'success',       TRUE,
        'updated_count', jsonb_array_length(p_changes)
    );
    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Bulk update failed: %', SQLERRM;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 11. Get profile list with joins (company, status, created_by)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_get_profile_list(
    p_company_id INT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT JSON_AGG(
        JSON_BUILD_OBJECT(
            'profile_header_id', ph."ProfileHeaderId",
            'company_id',        ph.company_id,
            'company_name',      cm.company_name,
            'status',            st.status_name,
            'status_id',         ph.status_id,
            'created_by_name',   u.username,
            'is_completed',      ph.is_completed,
            'created_date',      ph.created_date
        )
    )
    INTO v_result
    FROM  mechsoft.company_profile_header ph
    JOIN  public.mst_company           cm ON cm.company_id = ph.company_id
    LEFT  JOIN public.mst_status          st ON st.status_id  = ph.status_id
    LEFT  JOIN public.mst_users           u  ON u.user_id     = ph.created_by
    WHERE ph.company_id = p_company_id
      AND ph.is_deleted = FALSE;

    RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 12. Soft delete — header + Q&A + chat sessions
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mechsoft.fn_soft_delete_profile(
    p_company_id  INT,
    p_modified_by INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE mechsoft.company_profile_header
    SET    is_deleted    = TRUE,
           modified_by   = p_modified_by,
           modified_date = NOW()
    WHERE  company_id = p_company_id
      AND  is_deleted = FALSE;

    UPDATE mechsoft.tbl_profile_qa
    SET    is_deleted    = TRUE,
           modified_by   = p_modified_by,
           modified_date = NOW()
    WHERE  company_id = p_company_id
      AND  is_deleted = FALSE;

    UPDATE mechsoft.tbl_profile_ai_chat_session
    SET    is_deleted    = TRUE,
           modified_by   = p_modified_by,
           modified_date = NOW()
    WHERE  company_id = p_company_id
      AND  is_deleted = FALSE;

    RETURN TRUE;

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Soft delete failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_get_module_status_id(
    p_module_name VARCHAR,
    p_status_name VARCHAR
)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_status_id INT;
BEGIN
    SELECT s.status_id
    INTO   v_status_id
    FROM   public.mst_status  s
    JOIN   public.mst_modules m ON m.module_id = s.module_id
    WHERE  m.module_name = p_module_name
      AND  s.status_name = p_status_name
      AND  s.is_deleted  = FALSE
    LIMIT  1;

    RETURN v_status_id;
END;
$$;


CREATE OR REPLACE FUNCTION mechsoft.fn_set_profile_completed(
    p_company_id  INT,
    p_modified_by INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE mechsoft.company_profile_header
    SET    is_completed  = TRUE,
           modified_by   = p_modified_by,
           modified_date = NOW()
    WHERE  company_id = p_company_id
      AND  is_deleted  = FALSE;

    RETURN FOUND;
END;
$$;