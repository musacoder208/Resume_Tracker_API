-- ============================================================
-- Interview Process Module PostgreSQL Functions
-- Schemas: public (masters), mechsoft (transactional)
--
-- NOTE ON IDENTIFIER CASING: the module spec described some columns
-- with mixed case (e.g. "isRequired", "trans_candidateInterviewDetails").
-- Postgres folds unquoted identifiers to lowercase, so every reference
-- below uses the lowercase form (isrequired, trans_candidateinterviewdetails,
-- trans_candidateanswerdetails). If the live DDL actually quoted these to
-- preserve mixed case, these functions will need matching quoted identifiers.
-- ============================================================


-- ------------------------------------------------------------
-- 1. fn_ip_get_rounds
--    Active rounds configured for a company (client_id == company_id,
--    this module's tenant concept — see module notes).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ip_get_rounds(
  p_company_id BIGINT
)
RETURNS TABLE(id BIGINT, name VARCHAR, code VARCHAR)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT rm.id, rm.name, rm.code
  FROM public.mst_roundmaster rm
  WHERE rm.client_id  = p_company_id
    AND rm.is_active  = TRUE
    AND rm.is_deleted = FALSE
  ORDER BY rm.id;
END;
$$;


-- ------------------------------------------------------------
-- 2. fn_ip_get_round_by_id
--    Single active round lookup — used to validate roundId and
--    resolve its code (e.g. PRE_SCREENING) before an action is saved.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ip_get_round_by_id(
  p_round_id BIGINT
)
RETURNS TABLE(id BIGINT, client_id BIGINT, name VARCHAR, code VARCHAR)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT rm.id, rm.client_id, rm.name, rm.code
  FROM public.mst_roundmaster rm
  WHERE rm.id         = p_round_id
    AND rm.is_active  = TRUE
    AND rm.is_deleted = FALSE;
END;
$$;


-- ------------------------------------------------------------
-- 3. fn_ip_get_interview_modes
--    Informational lookup only (ONLINE / OFFLINE).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ip_get_interview_modes()
RETURNS TABLE(id BIGINT, name VARCHAR, code VARCHAR)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.name, m.code
  FROM public.mst_interviewmode m
  WHERE m.is_deleted = FALSE
  ORDER BY m.id;
END;
$$;


-- ------------------------------------------------------------
-- 4. fn_ip_get_contact_statuses
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ip_get_contact_statuses()
RETURNS TABLE(id BIGINT, name VARCHAR, code VARCHAR)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT cs.id, cs.name, cs.code
  FROM public.mst_contactstatus cs
  WHERE cs.is_deleted = FALSE
  ORDER BY cs.id;
END;
$$;


-- ------------------------------------------------------------
-- 5. fn_ip_get_contact_status_by_id
--    Validates a contactStatusId before it is saved.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ip_get_contact_status_by_id(
  p_id BIGINT
)
RETURNS TABLE(id BIGINT, name VARCHAR, code VARCHAR)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT cs.id, cs.name, cs.code
  FROM public.mst_contactstatus cs
  WHERE cs.id = p_id
    AND cs.is_deleted = FALSE;
END;
$$;


-- ------------------------------------------------------------
-- 6. fn_ip_get_round_actions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ip_get_round_actions()
RETURNS TABLE(id BIGINT, name VARCHAR, code VARCHAR)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT ra.id, ra.name, ra.code
  FROM public.mst_roundaction ra
  WHERE ra.is_deleted = FALSE
  ORDER BY ra.id;
END;
$$;


-- ------------------------------------------------------------
-- 7. fn_ip_get_round_action_by_id
--    Validates an actionId and resolves its code so the service
--    layer can enforce rule 1 (legal actions per round type).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ip_get_round_action_by_id(
  p_id BIGINT
)
RETURNS TABLE(id BIGINT, name VARCHAR, code VARCHAR)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT ra.id, ra.name, ra.code
  FROM public.mst_roundaction ra
  WHERE ra.id = p_id
    AND ra.is_deleted = FALSE;
END;
$$;


-- ------------------------------------------------------------
-- 7b. fn_ip_get_interviewers
--     Employee list for the interviewer picker (empid + employee_name
--     aliased as empname). No filters beyond the base table itself —
--     mst_employees is referenced elsewhere in this codebase (see
--     jd-functions.sql fn_get_all_jds) without an is_deleted/company
--     filter, so this follows the same precedent.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ip_get_interviewers()
RETURNS TABLE(empid BIGINT, empname VARCHAR)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT e.empid, e.employee_name AS empname
  FROM public.mst_employees e
  ORDER BY e.employee_name;
END;
$$;


-- ------------------------------------------------------------
-- 8. fn_ip_get_candidate_requisition
--    Resolves company_id / jd_id / job_title_id / seniority_id for a
--    candidate via tbl_candidates_header -> tbl_jd_header. Used so
--    callers never have to supply these manually (module business rule 4).
--    Exposed to the UI via GET /candidates/:candidateId/requisition so
--    it can be fetched right alongside the existing (untouched)
--    candidate-details API, then reused for GET /questions.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_ip_get_candidate_requisition(
  p_candidate_id BIGINT
)
RETURNS TABLE(candidate_id BIGINT, company_id BIGINT, jd_id BIGINT, job_title_id BIGINT, seniority_id BIGINT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT ch.candidate_id::BIGINT, h.company_id::BIGINT, ch.jd_id::BIGINT, h.job_title_id::BIGINT, h.seniority_id::BIGINT
  FROM mechsoft.tbl_candidates_header ch
  JOIN mechsoft.tbl_jd_header h ON h.jd_id = ch.jd_id
  WHERE ch.candidate_id = p_candidate_id
    AND ch.is_deleted   = FALSE
    AND h.is_deleted    = FALSE;
END;
$$;


-- ------------------------------------------------------------
-- 9. fn_ip_get_questions
--    Data-driven question config for a (company, jd, seniority,
--    round, action) combination — module business rule 4.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_ip_get_questions(
  p_company_id   BIGINT,
  p_jd_id        BIGINT,
  p_seniority_id BIGINT,
  p_round_id     BIGINT,
  p_action_id    BIGINT
)
RETURNS TABLE(
  question_id   BIGINT,
  mapping_id    BIGINT,
  text          TEXT,
  control_type  VARCHAR,
  is_required   BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id                AS question_id,
    m.id                AS mapping_id,
    q.question_text::TEXT     AS text,
    m.control_types     AS control_type,
    m.isrequired        AS is_required
  FROM mechsoft.tbl_interview_question_mapping m
  JOIN mechsoft.mst_interview_questions q ON q.id = m.question_id
  WHERE m.client_id     = p_company_id
    AND m.jd_id         = p_jd_id
    AND m.seniority_id  = p_seniority_id
    AND m.round_id      = p_round_id
    AND m.action_id     = p_action_id
    AND m.isactive      = TRUE
    AND m.is_deleted    = FALSE
  ORDER BY m.id;
END;
$$;


-- ------------------------------------------------------------
-- 10. fn_ip_save_contact_status
--     Upserts contact_status_id on the candidate's open/current row
--     for a round, independently of action_id (module business rule 2).
--     - p_trans_id given            -> update that exact row.
--     - no open row for the round   -> insert a fresh interim row
--                                      (action_id stays NULL).
--     - open row already exists     -> update it in place.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_ip_save_contact_status(
  p_candidate_id      BIGINT,
  p_trans_id          BIGINT,
  p_round_id          BIGINT,
  p_contact_status_id BIGINT,
  p_created_by        BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_trans_id BIGINT;
BEGIN
  IF p_trans_id IS NOT NULL THEN
    UPDATE mechsoft.trans_candidateinterviewdetails
    SET contact_status_id = p_contact_status_id,
        modified_by       = p_created_by,
        modified_date     = NOW()
    WHERE id           = p_trans_id
      AND candidate_id = p_candidate_id
    RETURNING id INTO v_trans_id;

    IF v_trans_id IS NULL THEN
      RAISE EXCEPTION 'Interview record % not found for candidate %', p_trans_id, p_candidate_id;
    END IF;

    RETURN v_trans_id;
  END IF;

  SELECT id INTO v_trans_id
  FROM mechsoft.trans_candidateinterviewdetails
  WHERE candidate_id = p_candidate_id
    AND round_id     = p_round_id
    AND action_id IS NULL
  ORDER BY id DESC
  LIMIT 1;

  IF v_trans_id IS NOT NULL THEN
    UPDATE mechsoft.trans_candidateinterviewdetails
    SET contact_status_id = p_contact_status_id,
        modified_by       = p_created_by,
        modified_date     = NOW()
    WHERE id = v_trans_id;

    RETURN v_trans_id;
  END IF;

  INSERT INTO mechsoft.trans_candidateinterviewdetails (
    candidate_id, round_id, contact_status_id,
    created_by, created_date
  )
  VALUES (
    p_candidate_id, p_round_id, p_contact_status_id,
    p_created_by, NOW()
  )
  RETURNING id INTO v_trans_id;

  RETURN v_trans_id;
END;
$$;


-- ------------------------------------------------------------
-- 11. fn_ip_save_round
--     Records one round's shared decision (module business rule 5):
--     - reuses the candidate's open row for this round if one exists
--       (e.g. created earlier by fn_ip_save_contact_status), else
--       inserts a new row.
--     - next_* columns are only meaningful when the caller has
--       already decided (in the service layer) that the action is
--       non-terminal and a next round was supplied.
--     - answers are replaced for the row's trans_id, so re-saving an
--       still-open round doesn't duplicate answer rows.
--     All business-rule validation (legal action per round, required
--     question answers) happens in the Node service layer before this
--     function is called — this function only persists already-valid data.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_ip_save_round(
  p_candidate_id             BIGINT,
  p_round_id                 BIGINT,
  p_interviewer_ids          BIGINT[],
  p_interview_datetime       TIMESTAMP,
  p_interview_type           BIGINT,  -- FK -> public.mst_interviewmode.id
  p_action_id                BIGINT,
  p_answers                  JSONB,
  p_next_round_id            BIGINT,
  p_next_interviewer_ids     BIGINT[],
  p_next_interview_datetime  TIMESTAMP,
  p_next_interview_type      BIGINT,  -- FK -> public.mst_interviewmode.id
  p_created_by               BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_trans_id    BIGINT;
  v_answer      JSONB;
  v_status_code TEXT;
  v_status_id   BIGINT;
BEGIN
  SELECT id INTO v_trans_id
  FROM mechsoft.trans_candidateinterviewdetails
  WHERE candidate_id = p_candidate_id
    AND round_id     = p_round_id
    AND action_id IS NULL
  ORDER BY id DESC
  LIMIT 1;

  IF v_trans_id IS NOT NULL THEN
    UPDATE mechsoft.trans_candidateinterviewdetails
    SET interviewer_id          = p_interviewer_ids,
        interview_datetime      = p_interview_datetime,
        interview_type          = p_interview_type,
        action_id               = p_action_id,
        next_round_id           = p_next_round_id,
        next_interviewer_id     = p_next_interviewer_ids,
        next_interview_datetime = p_next_interview_datetime,
        next_interview_type     = p_next_interview_type,
        modified_by             = p_created_by,
        modified_date           = NOW()
    WHERE id = v_trans_id;
  ELSE
    INSERT INTO mechsoft.trans_candidateinterviewdetails (
      candidate_id, round_id, interviewer_id, interview_datetime, interview_type,
      action_id, next_round_id, next_interviewer_id, next_interview_datetime, next_interview_type,
      created_by, created_date
    )
    VALUES (
      p_candidate_id, p_round_id, p_interviewer_ids, p_interview_datetime, p_interview_type,
      p_action_id, p_next_round_id, p_next_interviewer_ids, p_next_interview_datetime, p_next_interview_type,
      p_created_by, NOW()
    )
    RETURNING id INTO v_trans_id;
  END IF;

  DELETE FROM mechsoft.trans_candidateanswerdetails WHERE trans_id = v_trans_id;

  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers)
  LOOP
    INSERT INTO mechsoft.trans_candidateanswerdetails (
      trans_id, question_key, mapping_id, answer_text,
      created_by, created_date
    )
    VALUES (
      v_trans_id,
      (v_answer->>'questionId')::BIGINT,
      (v_answer->>'mappingId')::BIGINT,
      v_answer->>'answerText',
      p_created_by,
      NOW()
    );
  END LOOP;

  -- Mirror the round decision onto the candidate's master status (CAND_MGT module).
  -- Round-level "Hold" stays its own value in the Interview Process tab's dynamic status
  -- (see fn_ip_get_candidate_history), but folds into "In Interview Process" here on the
  -- candidate master record.
  SELECT CASE ra.code
           WHEN 'SHORTLISTED'        THEN 'shortlisted'
           WHEN 'REJECTED'           THEN 'rejected'
           WHEN 'MOVE_TO_NEXT_ROUND' THEN 'in_interview_process'
           WHEN 'HOLD'               THEN 'in_interview_process'
           WHEN 'FINAL_SELECT'       THEN 'selected'
         END
  INTO v_status_code
  FROM public.mst_roundaction ra
  WHERE ra.id = p_action_id;

  IF v_status_code IS NOT NULL THEN
    SELECT s.status_id INTO v_status_id
    FROM public.mst_status s
    INNER JOIN public.mst_modules m ON m.module_id = s.module_id
    WHERE m.module_code = 'CAND_MGT'
      AND s.status_code = v_status_code
    LIMIT 1;

    UPDATE mechsoft.tbl_candidates_header
    SET    status_id     = v_status_id,
           modified_by   = p_created_by,
           modified_date = NOW()
    WHERE  candidate_id  = p_candidate_id;
  END IF;

  RETURN v_trans_id;
END;
$$;


-- ------------------------------------------------------------
-- 12. fn_ip_get_candidate_history
--     Full timeline for a candidate + derived status (module
--     business rule 3) + current pending round (if any).
--     Returns NULL if the candidate does not exist.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_ip_get_candidate_history(
  p_candidate_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_candidate_exists BOOLEAN;
  v_rows             JSONB;
  v_latest           RECORD;
  v_candidate_status TEXT;
  v_pending_round    JSONB;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM mechsoft.tbl_candidates_header
    WHERE candidate_id = p_candidate_id AND is_deleted = FALSE
  ) INTO v_candidate_exists;

  IF NOT v_candidate_exists THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_key), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT
      t.id AS sort_key,
      jsonb_build_object(
        'transId',               t.id,
        'roundId',                t.round_id,
        'roundName',              r.name,
        'roundCode',              r.code,
        'interviewerIds',         COALESCE(to_jsonb(t.interviewer_id), '[]'::JSONB),
        'interviewerNames',       COALESCE((
          SELECT jsonb_agg(e.employee_name)
          FROM public.mst_employees e
          WHERE e.empid = ANY(t.interviewer_id)
        ), '[]'::JSONB),
        'interviewDatetime',      t.interview_datetime,
        'interviewTypeId',        t.interview_type,
        'interviewTypeName',      im.name,
        'contactStatusId',        t.contact_status_id,
        'contactStatusName',      cs.name,
        'actionId',               t.action_id,
        'actionName',             a.name,
        'actionCode',             a.code,
        'nextRoundId',            t.next_round_id,
        'nextRoundName',          nr.name,
        'nextInterviewerIds',     COALESCE(to_jsonb(t.next_interviewer_id), '[]'::JSONB),
        'nextInterviewerNames',   COALESCE((
          SELECT jsonb_agg(e2.employee_name)
          FROM public.mst_employees e2
          WHERE e2.empid = ANY(t.next_interviewer_id)
        ), '[]'::JSONB),
        'nextInterviewDatetime',  t.next_interview_datetime,
        'nextInterviewTypeId',    t.next_interview_type,
        'nextInterviewTypeName',  nim.name,
        'answers', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'questionId',   ad.question_key,
            'mappingId',    ad.mapping_id,
            'questionText', q.question_text,
            'answerText',   ad.answer_text
          ) ORDER BY ad.id)
          FROM mechsoft.trans_candidateanswerdetails ad
          LEFT JOIN mechsoft.mst_interview_questions q ON q.id = ad.question_key
          WHERE ad.trans_id = t.id
        ), '[]'::JSONB),
        'createdDate', t.created_date
      ) AS row_data
    FROM mechsoft.trans_candidateinterviewdetails t
    LEFT JOIN public.mst_roundmaster   r   ON r.id   = t.round_id
    LEFT JOIN public.mst_roundmaster   nr  ON nr.id  = t.next_round_id
    LEFT JOIN public.mst_contactstatus cs  ON cs.id  = t.contact_status_id
    LEFT JOIN public.mst_roundaction   a   ON a.id   = t.action_id
    LEFT JOIN public.mst_interviewmode im  ON im.id  = t.interview_type
    LEFT JOIN public.mst_interviewmode nim ON nim.id = t.next_interview_type
    WHERE t.candidate_id = p_candidate_id
  ) sub;

  SELECT t.* INTO v_latest
  FROM mechsoft.trans_candidateinterviewdetails t
  WHERE t.candidate_id = p_candidate_id
  ORDER BY t.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_candidate_status := 'Pending';
  ELSE
    IF v_latest.action_id IS NULL THEN
      -- Interim contact-status-only row: derived status keeps the prior decided status.
      SELECT CASE ra.code
               WHEN 'SHORTLISTED'        THEN 'Shortlisted'
               WHEN 'MOVE_TO_NEXT_ROUND' THEN 'In Interview Process'
               WHEN 'FINAL_SELECT'       THEN 'Selected'
               WHEN 'REJECTED'           THEN 'Rejected'
               WHEN 'HOLD'               THEN 'Hold'
               ELSE NULL
             END
      INTO v_candidate_status
      FROM mechsoft.trans_candidateinterviewdetails pt
      LEFT JOIN public.mst_roundaction ra ON ra.id = pt.action_id
      WHERE pt.candidate_id = p_candidate_id
        AND pt.action_id IS NOT NULL
      ORDER BY pt.id DESC
      LIMIT 1;

      v_candidate_status := COALESCE(v_candidate_status, 'Pending');
    ELSE
      SELECT CASE ra.code
               WHEN 'SHORTLISTED'        THEN 'Shortlisted'
               WHEN 'MOVE_TO_NEXT_ROUND' THEN 'In Interview Process'
               WHEN 'FINAL_SELECT'       THEN 'Selected'
               WHEN 'REJECTED'           THEN 'Rejected'
               WHEN 'HOLD'               THEN 'Hold'
               ELSE 'Pending'
             END
      INTO v_candidate_status
      FROM public.mst_roundaction ra
      WHERE ra.id = v_latest.action_id;
    END IF;

    IF v_latest.next_round_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM mechsoft.trans_candidateinterviewdetails x
      WHERE x.candidate_id = p_candidate_id
        AND x.round_id     = v_latest.next_round_id
        AND x.id > v_latest.id
    ) THEN
      SELECT jsonb_build_object(
        'roundId',           v_latest.next_round_id,
        'roundName',         pr.name,
        'interviewerIds',    COALESCE(to_jsonb(v_latest.next_interviewer_id), '[]'::JSONB),
        'interviewerNames',  COALESCE((
          SELECT jsonb_agg(pe.employee_name)
          FROM public.mst_employees pe
          WHERE pe.empid = ANY(v_latest.next_interviewer_id)
        ), '[]'::JSONB),
        'interviewDatetime', v_latest.next_interview_datetime,
        'interviewTypeId',   v_latest.next_interview_type,
        'interviewTypeName', im2.name
      )
      INTO v_pending_round
      FROM public.mst_roundmaster pr
      LEFT JOIN public.mst_interviewmode im2 ON im2.id = v_latest.next_interview_type
      WHERE pr.id = v_latest.next_round_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'candidateId',            p_candidate_id,
    'candidateStatus',        v_candidate_status,
    'currentContactStatusId', v_latest.contact_status_id,
    'pendingRound',           v_pending_round,
    'history',                v_rows
  );
END;
$$;
