-- ============================================================
-- HR Activity — Activity + Follow-up
-- Run in database: Resume_Tracker
--
-- Requires the follow-up master rows (activity FOLLOW_UP / sub-activity
-- SCHEDULED_CALL) in tbl_activity_master / tbl_sub_activity_master.
--
-- mechsoft.fn_save_candidate_activity is NOT changed: it is also called by
-- add_update_candidate_details, fn_add_update_candidate_score,
-- fn_save_hr_answers and fn_ip_save_round.
--
-- Called by src/modules/candidate/repositories/candidate.repository.ts
-- ============================================================


-- ------------------------------------------------------------
-- fn_get_activity_list
-- Activity dropdown. FOLLOW_UP is created by the save itself, never picked
-- by the user, so it is excluded here.
-- (Same parameters as before — CREATE OR REPLACE is enough.)
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_activity_list(TEXT);
CREATE OR REPLACE FUNCTION mechsoft.fn_get_activity_list(
  p_activity_type TEXT DEFAULT 'User'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_activities JSONB;
BEGIN
  SELECT jsonb_agg(
           jsonb_build_object(
             'activity_id',   am.activity_id,
             'activity_code', am.activity_code,
             'activity_name', am.activity_name,
             'activity_type', am.activity_type
           ) ORDER BY am.activity_id
         )
  INTO   v_activities
  FROM   mechsoft.tbl_activity_master am
  WHERE  am.is_deleted = FALSE
    AND  (p_activity_type IS NULL OR am.activity_type = p_activity_type)
    AND  UPPER(am.activity_code) <> 'FOLLOW_UP';   -- follow-ups come from the save, not the dropdown

  RETURN COALESCE(v_activities, '[]'::JSONB);
END;
$$;


-- ------------------------------------------------------------
-- fn_get_pending_follow_up
-- The logged-in user's latest PENDING follow-up for a candidate. The HR
-- Activity screen calls it before saving a follow-up to decide:
--   none            → insert a new follow-up
--   is_past = false → update the existing follow-up (no popup)
--   is_past = true  → ask: complete it + insert new, or update it
-- is_past compares date + time with the DB clock (IST, same as start_date).
-- Returns { follow_up_id, start_date, alert_id, is_past }, or {} when none.
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_pending_follow_up(BIGINT, BIGINT, BIGINT);
CREATE OR REPLACE FUNCTION mechsoft.fn_get_pending_follow_up(
  p_org_id       BIGINT DEFAULT NULL,
  p_candidate_id BIGINT DEFAULT NULL,
  p_user_id      BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
           'follow_up_id', ca.candidate_activity_id,
           'start_date',   ca.start_date,
           'alert_id',     ca.alert_id,
           'is_past',      COALESCE(ca.start_date < LOCALTIMESTAMP, TRUE)
         )
  INTO   v_result
  FROM   mechsoft.tbl_candidate_activity ca
  JOIN   mechsoft.tbl_activity_master am ON am.activity_id = ca.activity_id
  JOIN   mechsoft.tbl_activity_status s  ON s.status_id   = ca.status_id
  WHERE  UPPER(am.activity_code) = 'FOLLOW_UP'
    AND  s.status_code  = 'PENDING'
    AND  ca.candidate_id = p_candidate_id
    AND  ca.created_by   = p_user_id
    AND  COALESCE(ca.is_deleted, FALSE) = FALSE
    AND  (p_org_id IS NULL OR ca.org_id = p_org_id)
  ORDER  BY ca.start_date DESC NULLS LAST, ca.candidate_activity_id DESC
  LIMIT  1;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;


-- ------------------------------------------------------------
-- fn_save_candidate_activity_with_follow_up
-- HR Activity save (insert only; edits keep using fn_save_candidate_activity).
--
--   Activity row  (when p_activity_code is given)
--     selected activity / sub-activity / note, no start date,
--     status COMPLETED.
--   Follow-up     (when p_follow_up_date is given), by p_follow_up_action:
--     UPDATE_EXISTING  → update this user's latest PENDING follow-up with the
--                        new date / alert (standard update in
--                        fn_save_candidate_activity: alert kept if none given).
--                        If there is none, a new follow-up is inserted.
--     NEW / COMPLETE_AND_NEW
--                      → this user's PENDING follow-ups for the candidate →
--                        COMPLETED, then insert FOLLOW_UP / SCHEDULED_CALL
--                        (no note) as PENDING.
--   Completing a follow-up (p_complete_follow_up_id — My Action "Log Activity"):
--     the follow-up must be this user's PENDING follow-up for the candidate,
--     else nothing is saved. It is marked COMPLETED even without a new
--     follow-up date; a new follow-up date is always inserted as NEW.
--
-- Everything runs in one transaction: any failure rolls back all changes.
-- Returns { success, message, activity_id, follow_up_id, follow_up_action_taken }.
-- ------------------------------------------------------------
-- Earlier versions had 8 / 9 parameters. Adding a parameter needs
-- DROP + CREATE (only the API calls this function).
DROP FUNCTION IF EXISTS mechsoft.fn_save_candidate_activity_with_follow_up(BIGINT, BIGINT, BIGINT, VARCHAR, VARCHAR, TEXT, BIGINT, TIMESTAMP);
DROP FUNCTION IF EXISTS mechsoft.fn_save_candidate_activity_with_follow_up(BIGINT, BIGINT, BIGINT, VARCHAR, VARCHAR, TEXT, BIGINT, TIMESTAMP, VARCHAR);
-- DROP FUNCTION IF EXISTS mechsoft.fn_save_candidate_activity_with_follow_up(BIGINT, BIGINT, BIGINT, VARCHAR, VARCHAR, TEXT, BIGINT, TIMESTAMP, VARCHAR, BIGINT);
CREATE OR REPLACE FUNCTION mechsoft.fn_save_candidate_activity_with_follow_up(
  p_org_id                BIGINT    DEFAULT NULL,
  p_candidate_id          BIGINT    DEFAULT NULL,
  p_user_id               BIGINT    DEFAULT NULL,
  p_activity_code         VARCHAR   DEFAULT NULL,
  p_sub_activity_code     VARCHAR   DEFAULT NULL,
  p_notes                 TEXT      DEFAULT NULL,
  p_alert_id              BIGINT    DEFAULT NULL,
  p_follow_up_date        TIMESTAMP DEFAULT NULL,
  p_follow_up_action      VARCHAR   DEFAULT 'NEW',
  p_complete_follow_up_id BIGINT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  c_follow_up_activity CONSTANT VARCHAR := 'FOLLOW_UP';
  c_follow_up_sub      CONSTANT VARCHAR := 'SCHEDULED_CALL';
  v_activity_code      VARCHAR := NULLIF(UPPER(TRIM(p_activity_code)), '');
  v_action             VARCHAR := COALESCE(NULLIF(UPPER(TRIM(p_follow_up_action)), ''), 'NEW');
  v_pending_id         BIGINT;
  v_completed_id       BIGINT;
  v_result             JSONB;
  v_activity_row_id    BIGINT;
  v_follow_up_id       BIGINT;
  v_existing_id        BIGINT;
  v_action_taken       VARCHAR;
BEGIN
  -- ── 1. Validation ─────────────────────────────────────────────
  IF p_candidate_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Candidate is required');
  END IF;

  IF v_activity_code IS NULL AND p_follow_up_date IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Select an activity or a follow-up date');
  END IF;

  IF v_activity_code = c_follow_up_activity THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Follow-up activity cannot be selected directly');
  END IF;

  IF v_action NOT IN ('NEW', 'UPDATE_EXISTING', 'COMPLETE_AND_NEW') THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Invalid follow-up action: ' || p_follow_up_action);
  END IF;

  SELECT status_id INTO v_pending_id
  FROM   mechsoft.tbl_activity_status
  WHERE  status_code = 'PENDING' AND COALESCE(is_deleted, FALSE) = FALSE;

  SELECT status_id INTO v_completed_id
  FROM   mechsoft.tbl_activity_status
  WHERE  status_code = 'COMPLETED' AND COALESCE(is_deleted, FALSE) = FALSE;

  IF v_pending_id IS NULL OR v_completed_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Activity status master is not configured');
  END IF;

  -- Follow-up being completed: must still be this user's PENDING follow-up
  IF p_complete_follow_up_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   mechsoft.tbl_candidate_activity ca
      JOIN   mechsoft.tbl_activity_master am ON am.activity_id = ca.activity_id
      WHERE  ca.candidate_activity_id = p_complete_follow_up_id
        AND  UPPER(am.activity_code) = c_follow_up_activity
        AND  ca.candidate_id = p_candidate_id
        AND  ca.created_by   = p_user_id
        AND  ca.status_id    = v_pending_id
        AND  COALESCE(ca.is_deleted, FALSE) = FALSE
        AND  (p_org_id IS NULL OR ca.org_id = p_org_id)
    ) THEN
      RETURN jsonb_build_object('success', FALSE, 'message', 'Follow-up is already completed or not found');
    END IF;
    -- The follow-up is closed here, so a new follow-up date is always a new row
    v_action := 'NEW';
  END IF;

  -- ── 2. Activity row (done now → COMPLETED) ────────────────────
  IF v_activity_code IS NOT NULL THEN
    v_result := mechsoft.fn_save_candidate_activity(
      p_org_id, p_candidate_id, v_activity_code, p_sub_activity_code,
      p_notes, NULL, p_user_id, NULL, NULL, NULL
    );
    IF NOT COALESCE((v_result->>'success')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION '%', v_result->>'message';
    END IF;
    v_activity_row_id := (v_result->>'candidate_activity_id')::BIGINT;

    UPDATE mechsoft.tbl_candidate_activity
    SET    status_id     = v_completed_id,
           end_date      = CURRENT_TIMESTAMP,
           modified_by   = p_user_id,
           modified_date = CURRENT_TIMESTAMP
    WHERE  candidate_activity_id = v_activity_row_id;
  END IF;

  -- ── 2b. Complete the follow-up this save is for ───────────────
  IF p_complete_follow_up_id IS NOT NULL THEN
    UPDATE mechsoft.tbl_candidate_activity
    SET    status_id     = v_completed_id,
           end_date      = CURRENT_TIMESTAMP,
           modified_by   = p_user_id,
           modified_date = CURRENT_TIMESTAMP
    WHERE  candidate_activity_id = p_complete_follow_up_id;
  END IF;

  -- ── 3. Follow-up ──────────────────────────────────────────────
  IF p_follow_up_date IS NOT NULL THEN
    -- This user's latest pending follow-up for the candidate (if any)
    SELECT ca.candidate_activity_id
    INTO   v_existing_id
    FROM   mechsoft.tbl_candidate_activity ca
    JOIN   mechsoft.tbl_activity_master am ON am.activity_id = ca.activity_id
    WHERE  UPPER(am.activity_code) = c_follow_up_activity
      AND  ca.candidate_id = p_candidate_id
      AND  ca.created_by   = p_user_id
      AND  ca.status_id    = v_pending_id
      AND  COALESCE(ca.is_deleted, FALSE) = FALSE
      AND  (p_org_id IS NULL OR ca.org_id = p_org_id)
    ORDER  BY ca.start_date DESC NULLS LAST, ca.candidate_activity_id DESC
    LIMIT  1;

    IF v_action = 'UPDATE_EXISTING' AND v_existing_id IS NOT NULL THEN
      -- 3a. Update the existing follow-up (standard update; stays PENDING)
      v_result := mechsoft.fn_save_candidate_activity(
        p_org_id, p_candidate_id, c_follow_up_activity, c_follow_up_sub,
        NULL, p_follow_up_date, p_user_id, v_existing_id, NULL, p_alert_id
      );
      IF NOT COALESCE((v_result->>'success')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION '%', v_result->>'message';
      END IF;
      v_follow_up_id := v_existing_id;
      v_action_taken := 'UPDATED';

    ELSE
      -- 3b. Complete this user's pending follow-ups for the candidate
      UPDATE mechsoft.tbl_candidate_activity ca
      SET    status_id     = v_completed_id,
             end_date      = CURRENT_TIMESTAMP,
             modified_by   = p_user_id,
             modified_date = CURRENT_TIMESTAMP
      FROM   mechsoft.tbl_activity_master am
      WHERE  am.activity_id = ca.activity_id
        AND  UPPER(am.activity_code) = c_follow_up_activity
        AND  ca.candidate_id = p_candidate_id
        AND  ca.created_by   = p_user_id
        AND  ca.status_id    = v_pending_id
        AND  COALESCE(ca.is_deleted, FALSE) = FALSE
        AND  (p_org_id IS NULL OR ca.org_id = p_org_id);

      -- 3c. Insert the new follow-up — no note (the note is on the activity row)
      v_result := mechsoft.fn_save_candidate_activity(
        p_org_id, p_candidate_id, c_follow_up_activity, c_follow_up_sub,
        NULL, p_follow_up_date, p_user_id, NULL, NULL, p_alert_id
      );
      IF NOT COALESCE((v_result->>'success')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION '%', v_result->>'message';
      END IF;
      v_follow_up_id := (v_result->>'candidate_activity_id')::BIGINT;

      UPDATE mechsoft.tbl_candidate_activity
      SET    status_id     = v_pending_id,
             modified_by   = p_user_id,
             modified_date = CURRENT_TIMESTAMP
      WHERE  candidate_activity_id = v_follow_up_id;
      v_action_taken := 'INSERTED';
    END IF;
  END IF;

  -- ── 4. Result ─────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',      TRUE,
    'message',      CASE
                      WHEN v_activity_row_id IS NOT NULL AND v_follow_up_id IS NOT NULL
                        THEN 'Activity and follow-up saved successfully'
                      WHEN v_action_taken = 'UPDATED'
                        THEN 'Follow-up updated successfully'
                      WHEN v_follow_up_id IS NOT NULL
                        THEN 'Follow-up scheduled successfully'
                      WHEN p_complete_follow_up_id IS NOT NULL
                        THEN 'Activity saved and follow-up completed'
                      ELSE 'Activity saved successfully'
                    END,
    'activity_id',            v_activity_row_id,
    'follow_up_id',           v_follow_up_id,
    'follow_up_action_taken', v_action_taken
  );

EXCEPTION
  -- Any error above rolls back every change made in this function
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'message', SQLERRM);
END;
$$;


-- ------------------------------------------------------------
-- fn_get_candidate_activity (HR Activity history)
-- Adds activity_code / sub_activity_code to each row so the UI can tell
-- follow-up rows (FOLLOW_UP) apart for editing. Additive only — all
-- existing fields are unchanged. (Same parameters — CREATE OR REPLACE.)
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_candidate_activity(BIGINT, BIGINT, BIGINT, BIGINT);
CREATE OR REPLACE FUNCTION mechsoft.fn_get_candidate_activity(
  p_org_id       BIGINT DEFAULT NULL,
  p_candidate_id BIGINT DEFAULT NULL,
  p_page         BIGINT DEFAULT 1,
  p_page_size    BIGINT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_activities  JSONB;
  v_total_count BIGINT;
  v_offset      BIGINT;
BEGIN
  -- ── 1. Basic validation ───────────────────────────────────────
  IF p_candidate_id IS NULL THEN
    RETURN jsonb_build_object('total_count', 0, 'activities', '[]'::JSONB);
  END IF;

  IF p_page IS NULL OR p_page < 1 THEN
    p_page := 1;
  END IF;

  IF p_page_size IS NULL OR p_page_size < 1 THEN
    p_page_size := 10;
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- ── 2. Total count (all filters, no LIMIT) ────────────────────
  SELECT COUNT(*)
  INTO   v_total_count
  FROM   mechsoft.tbl_candidate_activity ca
  INNER JOIN mechsoft.tbl_activity_master am
         ON am.activity_id = ca.activity_id
  WHERE  ca.is_deleted   = FALSE
    AND  ca.candidate_id = p_candidate_id
    AND  (p_org_id IS NULL OR ca.org_id = p_org_id);

  -- ── 3. Paginated activity list ────────────────────────────────
  SELECT jsonb_agg(row ORDER BY created_date DESC, candidate_activity_id DESC)
  INTO   v_activities
  FROM (
    SELECT jsonb_build_object(
             'candidate_activity_id', ca.candidate_activity_id,
             'candidate_id',          ca.candidate_id,
             'activity_id',           ca.activity_id,
             'activity_code',         am.activity_code,        -- new
             'activity_name',         am.activity_name,
             'sub_activity_id',       ca.sub_activity_id,
             'sub_activity_code',     sa.sub_activity_code,    -- new
             'sub_activity_name',     sa.sub_activity_name,
             'activity_type',         ca.activity_type,
             'notes',                 ca.notes,
             'start_date',            ca.start_date,
             'is_highlighted',        COALESCE(ca.is_highlighted, FALSE),
             'alert_id',              ca.alert_id,
             'alert_name',            al.alert_name,
             'status_id',             ca.status_id,
             'status_code',           st.status_code,
             'status_name',           st.status_name,
             'created_by',            ca.created_by,
             'created_date',          ca.created_date
           ) AS row,
           ca.created_date,
           ca.candidate_activity_id
    FROM   mechsoft.tbl_candidate_activity ca
    INNER JOIN mechsoft.tbl_activity_master am
           ON am.activity_id = ca.activity_id
    LEFT JOIN mechsoft.tbl_sub_activity_master sa
           ON sa.sub_activity_id = ca.sub_activity_id
    LEFT JOIN mechsoft.tbl_alert_master al
           ON al.alert_id   = ca.alert_id
          AND al.is_deleted = FALSE
    LEFT JOIN mechsoft.tbl_activity_status st
           ON st.status_id = ca.status_id
    WHERE  ca.is_deleted   = FALSE
      AND  ca.candidate_id = p_candidate_id
      AND  (p_org_id IS NULL OR ca.org_id = p_org_id)
    ORDER  BY ca.created_date DESC, ca.candidate_activity_id DESC
    LIMIT  p_page_size
    OFFSET v_offset
  ) subq;

  -- ── 4. Return combined result ─────────────────────────────────
  RETURN jsonb_build_object(
    'total_count', COALESCE(v_total_count, 0),
    'page',        p_page,
    'page_size',   p_page_size,
    'activities',  COALESCE(v_activities, '[]'::JSONB)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('total_count', 0, 'activities', '[]'::JSONB, 'message', SQLERRM);
END;
$$;


-- ------------------------------------------------------------
-- fn_get_activity_callback_request_list (My Action)
-- Now lists follow-ups (SCHEDULED_CALL) instead of Callback Request rows.
-- The status filter is unchanged (the My Action screen defaults to PENDING).
-- (Same parameters as before — CREATE OR REPLACE is enough.)
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_activity_callback_request_list(BIGINT, BIGINT, VARCHAR, DATE, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION mechsoft.fn_get_activity_callback_request_list(
  p_org_id      BIGINT  DEFAULT NULL,
  p_user_id     BIGINT  DEFAULT NULL,
  p_status_code VARCHAR DEFAULT NULL,
  p_start_date  DATE    DEFAULT NULL,
  p_page_number INTEGER DEFAULT 1,
  p_page_size   INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_status_code  VARCHAR;   -- Normalised status code filter
  v_page_number  INTEGER;
  v_page_size    INTEGER;
  v_offset       INTEGER;
  v_total_count  BIGINT;
  v_data         JSONB;
BEGIN
  -- ── 1. Normalise & validate inputs ──────────────────────────────────
  v_status_code := NULLIF(UPPER(TRIM(p_status_code)), '');
  v_page_number := GREATEST(COALESCE(p_page_number, 1), 1);
  v_page_size   := LEAST(GREATEST(COALESCE(p_page_size, 10), 1), 100);  -- cap at 100
  v_offset      := (v_page_number - 1) * v_page_size;

  IF v_status_code IS NOT NULL AND NOT EXISTS (
       SELECT 1
       FROM   mechsoft.tbl_activity_status
       WHERE  status_code = v_status_code
         AND  COALESCE(is_deleted, FALSE) = FALSE) THEN
    RETURN jsonb_build_object('success', FALSE, 'message', 'Invalid status code: ' || p_status_code);
  END IF;

  -- ── 2. Fetch follow-up activities (all statuses) + paginate ─────────
  WITH base AS (
    SELECT
      -- Activity details
      ca.candidate_activity_id,
      ca.candidate_id,
      -- Candidate details
      ch.full_name,
      ch.email,
      ch.phone,
      ch.current_job_title,
      ch.current_company,
      -- Job description (same label format as fn_get_jd_dropdown)
      ch.jd_id,
      NULLIF(TRIM(CONCAT_WS(' ', sn.name, jt.title)), '') AS jd_name,
      -- Activity / sub-activity names
      ca.activity_id,
      am.activity_name,
      ca.sub_activity_id,
      sam.sub_activity_name,
      ca.notes,
      -- Callback timing
      ca.start_date                                        AS callback_date,
      -- Overdue only makes sense while still pending
      (s.status_code = 'PENDING'
       AND ca.start_date < CURRENT_TIMESTAMP)              AS is_overdue,
      -- Status
      ca.status_id,
      s.status_code,
      s.status_name,
      ca.is_highlighted,
      -- Audit
      ca.created_by,
      ca.created_date
    FROM mechsoft.tbl_candidate_activity ca
    -- Candidate (skip deleted candidates)
    INNER JOIN mechsoft.tbl_candidates_header ch
            ON ch.candidate_id = ca.candidate_id
           AND COALESCE(ch.is_deleted, FALSE) = FALSE
    -- Job description (LEFT JOIN: candidate still shows if JD is missing)
    LEFT JOIN mechsoft.tbl_jd_header jd
           ON jd.jd_id = ch.jd_id
          AND COALESCE(jd.is_deleted, FALSE) = FALSE
    LEFT JOIN public.mst_seniority sn
           ON sn.id = jd.seniority_id
          AND COALESCE(sn.is_deleted, FALSE) = FALSE
    LEFT JOIN public.mst_jobtitle jt
           ON jt.id = jd.job_title_id
          AND COALESCE(jt.is_deleted, FALSE) = FALSE
    -- Parent activity (for display name)
    INNER JOIN mechsoft.tbl_activity_master am
            ON am.activity_id = ca.activity_id
           AND COALESCE(am.is_deleted, FALSE) = FALSE
    -- Sub-activity must belong to the parent activity
    INNER JOIN mechsoft.tbl_sub_activity_master sam
            ON sam.sub_activity_id = ca.sub_activity_id
           AND sam.activity_id     = ca.activity_id
           AND COALESCE(sam.is_deleted, FALSE) = FALSE
    -- Status (code + name)
    INNER JOIN mechsoft.tbl_activity_status s
            ON s.status_id = ca.status_id
    WHERE COALESCE(ca.is_deleted, FALSE) = FALSE
      AND sam.sub_activity_code = 'SCHEDULED_CALL'                                 -- Follow-ups only
      AND (v_status_code IS NULL OR s.status_code = v_status_code)                 -- Status filter
      AND (p_start_date  IS NULL OR (ca.start_date >= p_start_date                 -- Start date (whole day)
                                 AND ca.start_date <  p_start_date + INTERVAL '1 day'))
      AND (p_org_id      IS NULL OR ca.org_id     = p_org_id)                      -- Org filter
      AND (p_user_id     IS NULL OR ca.created_by = p_user_id)                     -- Logged-in user filter
  ),
  paged AS (
    SELECT *
    FROM   base
    -- Pending first, then soonest callback, then latest created; id keeps paging stable
    ORDER  BY (status_code = 'PENDING') DESC,
              callback_date ASC NULLS LAST,
              created_date DESC,
              candidate_activity_id DESC
    LIMIT  v_page_size
    OFFSET v_offset
  )
  SELECT
    (SELECT COUNT(*) FROM base),
    COALESCE(
      jsonb_agg(to_jsonb(p) ORDER BY (p.status_code = 'PENDING') DESC,
                                     p.callback_date ASC NULLS LAST,
                                     p.created_date DESC,
                                     p.candidate_activity_id DESC),
      '[]'::jsonb)
  INTO v_total_count, v_data
  FROM paged p;

  -- ── 3. Return result ────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',     TRUE,
    'message',     'Callback request list fetched successfully',
    'total_count', v_total_count,
    'page_number', v_page_number,
    'page_size',   v_page_size,
    'total_pages', CEIL(v_total_count::numeric / v_page_size)::int,
    'data',        v_data
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'message', SQLERRM);
END;
$$;


-- ------------------------------------------------------------
-- Index for the follow-up lookups below (candidate list, pending check).
-- tbl_candidate_activity only had its primary key.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tbl_candidate_activity_candidate
  ON mechsoft.tbl_candidate_activity (candidate_id);


-- ------------------------------------------------------------
-- fn_get_candidate_list (Candidate page)
-- The deployed 12-parameter version, unchanged, plus follow-up info only:
--   - each row gets the candidate's earliest PENDING follow-up:
--       follow_up_id, follow_up_date, is_follow_up_overdue (date + time
--       compared with the DB clock, same as fn_get_pending_follow_up)
--   - order: candidates with a pending follow-up first (overdue → today →
--     upcoming, by date), then the existing order (HR status Pending first,
--     newest candidate first).
-- Same parameters and return type → CREATE OR REPLACE (no DROP, API unchanged).
-- Filters, total_count and summary are unchanged.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_candidate_list(
  p_jd_id             BIGINT DEFAULT NULL,
  p_search_text       TEXT   DEFAULT NULL,
  p_verdict           TEXT   DEFAULT NULL,
  p_experience_range  TEXT   DEFAULT NULL,
  p_page              BIGINT DEFAULT 1,
  p_page_size         BIGINT DEFAULT 10,
  p_status_id         BIGINT DEFAULT NULL,
  p_hr_status_code    TEXT   DEFAULT NULL,
  p_gender            TEXT   DEFAULT NULL,
  p_round_id          BIGINT DEFAULT NULL,
  p_action_id         BIGINT DEFAULT NULL,
  p_sub_activity_code TEXT   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
  v_candidates        JSONB;
  v_summary           JSONB;
  v_total_count       BIGINT;
  v_offset            BIGINT;
  v_sub_activity_code TEXT;   -- normalised sub-activity code (NULL = all)
BEGIN
  v_offset            := (p_page - 1) * p_page_size;
  v_sub_activity_code := NULLIF(UPPER(TRIM(p_sub_activity_code)), '');

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
  -- each candidate's latest HR status (from hr_answers -> hr_question_options)
  LEFT JOIN (
    SELECT DISTINCT ON (ha.candidate_id)
           ha.candidate_id,
           o.parent_status_code
    FROM   mechsoft.tbl_candidate_hr_answers ha
    INNER JOIN mechsoft.tbl_hr_question_options o
           ON o.question_key = ha.question_key
          AND o.option_value = ha.answer_text
    WHERE  ha.question_key = 'interview_update'
    ORDER  BY ha.candidate_id, ha.created_date DESC
  ) hr ON hr.candidate_id = ch.candidate_id
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
    AND (p_hr_status_code IS NULL OR hr.parent_status_code = p_hr_status_code)
    AND (p_gender IS NULL OR ch.gender ILIKE p_gender)
    AND (
      (p_round_id IS NULL AND p_action_id IS NULL)
      OR EXISTS (
        SELECT 1 FROM mechsoft.trans_candidateinterviewdetails t
        WHERE t.candidate_id = ch.candidate_id
          AND (p_round_id  IS NULL OR t.round_id  = p_round_id)
          AND (p_action_id IS NULL OR t.action_id = p_action_id)
      )
    )
    AND (
      v_sub_activity_code IS NULL
      OR EXISTS (
        SELECT 1
        FROM   mechsoft.tbl_candidate_activity ca
        INNER JOIN mechsoft.tbl_sub_activity_master sam
               ON sam.sub_activity_id = ca.sub_activity_id
              AND sam.activity_id     = ca.activity_id
              AND COALESCE(sam.is_deleted, FALSE) = FALSE
        WHERE  ca.candidate_id = ch.candidate_id
          AND  COALESCE(ca.is_deleted, FALSE) = FALSE
          AND  UPPER(sam.sub_activity_code) = v_sub_activity_code
      )
    );

  -- ── 2. Paginated candidate list ───────────────────────────────
  SELECT jsonb_agg(row)
  INTO   v_candidates
  FROM (
    SELECT jsonb_build_object(
      'candidate_id',         ch.candidate_id,
      'jd_id',                ch.jd_id,
      'full_name',            ch.full_name,
      'email',                ch.email,
      'gender',               ch.gender,
      'phone',                ch.phone,
      'location',             ch.location,
      'current_job_title',    ch.current_job_title,
      'current_company',      ch.current_company,
      'total_experience',     ch.total_experience,
      'technical_skills',     COALESCE(sk.technical_skills, '[]'::JSONB),
      'degree',               ed.degree,
      'final_score',          sc.final_score,
      'verdict',              sc.verdict,
      'hr_status_code',       hr.parent_status_code,
      'hr_status_label',      hr.hr_status_label,
      'status_code',          ms.status_code,
      'status_name',          ms.status_name,
      -- NEW: pending follow-up (NULLs when none)
      'follow_up_id',         fu.candidate_activity_id,
      'follow_up_date',       fu.start_date,
      'is_follow_up_overdue', CASE WHEN fu.candidate_activity_id IS NULL THEN NULL
                                   ELSE COALESCE(fu.start_date < LOCALTIMESTAMP, TRUE) END
    ) AS row
    FROM mechsoft.tbl_candidates_header ch

    LEFT JOIN public.mst_status ms ON ms.status_id = ch.status_id

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

    LEFT JOIN (
      SELECT DISTINCT ON (ha.candidate_id)
             ha.candidate_id,
             o.parent_status_code,
             o.option_label AS hr_status_label
      FROM   mechsoft.tbl_candidate_hr_answers ha
      INNER JOIN mechsoft.tbl_hr_question_options o
             ON o.question_key = ha.question_key
            AND o.option_value = ha.answer_text
      WHERE  ha.question_key = 'interview_update'
      ORDER  BY ha.candidate_id, ha.created_date DESC
    ) hr ON hr.candidate_id = ch.candidate_id

    -- NEW: the candidate's earliest PENDING follow-up
    LEFT JOIN LATERAL (
      SELECT ca.candidate_activity_id, ca.start_date
      FROM   mechsoft.tbl_candidate_activity ca
      JOIN   mechsoft.tbl_activity_master am ON am.activity_id = ca.activity_id
      JOIN   mechsoft.tbl_activity_status s  ON s.status_id   = ca.status_id
      WHERE  ca.candidate_id = ch.candidate_id
        AND  UPPER(am.activity_code) = 'FOLLOW_UP'
        AND  s.status_code = 'PENDING'
        AND  COALESCE(ca.is_deleted, FALSE) = FALSE
      ORDER  BY ca.start_date ASC NULLS FIRST, ca.candidate_activity_id
      LIMIT  1
    ) fu ON TRUE

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
      AND (p_hr_status_code IS NULL OR hr.parent_status_code = p_hr_status_code)
      AND (p_gender IS NULL OR ch.gender ILIKE p_gender)
      AND (
        (p_round_id IS NULL AND p_action_id IS NULL)
        OR EXISTS (
          SELECT 1 FROM mechsoft.trans_candidateinterviewdetails t
          WHERE t.candidate_id = ch.candidate_id
            AND (p_round_id  IS NULL OR t.round_id  = p_round_id)
            AND (p_action_id IS NULL OR t.action_id = p_action_id)
        )
      )
      AND (
        v_sub_activity_code IS NULL
        OR EXISTS (
          SELECT 1
          FROM   mechsoft.tbl_candidate_activity ca
          INNER JOIN mechsoft.tbl_sub_activity_master sam
                 ON sam.sub_activity_id = ca.sub_activity_id
                AND sam.activity_id     = ca.activity_id
                AND COALESCE(sam.is_deleted, FALSE) = FALSE
          WHERE  ca.candidate_id = ch.candidate_id
            AND  COALESCE(ca.is_deleted, FALSE) = FALSE
            AND  UPPER(sam.sub_activity_code) = v_sub_activity_code
        )
      )
    ORDER BY
      CASE WHEN fu.candidate_activity_id IS NULL THEN 1 ELSE 0 END,   -- NEW: pending follow-ups first
      fu.start_date ASC NULLS FIRST,                                  -- NEW: overdue → today → upcoming
      CASE WHEN hr.parent_status_code = 'PENDING' THEN 0 ELSE 1 END,  -- HR status Pending first
      ch.candidate_id DESC
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
$function$;
