-- ============================================================
-- Dashboard Module - PostgreSQL Functions
-- Schema: mechsoft
-- ============================================================

-- ------------------------------------------------------------
-- fn_get_dashboard_overview
-- Returns stats cards + recent activity for the dashboard.
-- Stats:
--   total_jobs        – active JDs for the company
--   total_candidates  – candidates across all company JDs
--   active_interviews – candidates with an "interview" feedback
--   hired_this_month  – candidates with "hired" feedback this month
--   pending_reviews   – scored candidates with no HR feedback yet
-- Recent Activity:
--   last 10 events from candidates, finalized JDs, profile updates
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_dashboard_overview(
  p_company_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_jobs        INT  := 0;
  v_total_candidates  INT  := 0;
  v_active_interviews INT  := 0;
  v_hired_this_month  INT  := 0;
  v_pending_reviews   INT  := 0;
  v_recent_activity   JSONB := '[]'::jsonb;
BEGIN

  -- ── Stats ───────────────────────────────────────────────────

  SELECT COUNT(*)
  INTO v_total_jobs
  FROM mechsoft.tbl_jd_header
  WHERE company_id = p_company_id
    AND is_deleted  = FALSE;

  SELECT COUNT(*)
  INTO v_total_candidates
  FROM mechsoft.tbl_candidates_header ch
  JOIN mechsoft.tbl_jd_header jh ON jh.jd_id = ch.jd_id
  WHERE jh.company_id = p_company_id
    AND ch.is_deleted  = FALSE
    AND jh.is_deleted  = FALSE;

  SELECT COUNT(DISTINCT ch.candidate_id)
  INTO v_active_interviews
  FROM mechsoft.tbl_candidates_header ch
  JOIN mechsoft.tbl_jd_header jh
    ON jh.jd_id = ch.jd_id
  JOIN mechsoft.tbl_candidate_hr_feedbacks f
    ON f.candidate_id = ch.candidate_id AND f.is_deleted = FALSE
  JOIN mechsoft.tbl_candidate_feedbacktype ft
    ON ft.feedback_type_id = f.feedback_type_id AND ft.is_active = TRUE
  WHERE jh.company_id  = p_company_id
    AND ch.is_deleted   = FALSE
    AND jh.is_deleted   = FALSE
    AND LOWER(ft.feedback_type) LIKE '%interview%';

  SELECT COUNT(DISTINCT ch.candidate_id)
  INTO v_hired_this_month
  FROM mechsoft.tbl_candidates_header ch
  JOIN mechsoft.tbl_jd_header jh
    ON jh.jd_id = ch.jd_id
  JOIN mechsoft.tbl_candidate_hr_feedbacks f
    ON f.candidate_id = ch.candidate_id AND f.is_deleted = FALSE
  JOIN mechsoft.tbl_candidate_feedbacktype ft
    ON ft.feedback_type_id = f.feedback_type_id AND ft.is_active = TRUE
  WHERE jh.company_id  = p_company_id
    AND ch.is_deleted   = FALSE
    AND jh.is_deleted   = FALSE
    AND LOWER(ft.feedback_type) LIKE '%hired%'
    AND DATE_TRUNC('month', f.created_date) = DATE_TRUNC('month', NOW());

  -- Pending Reviews: scored candidates who have not yet received HR feedback
  SELECT COUNT(DISTINCT ch.candidate_id)
  INTO v_pending_reviews
  FROM mechsoft.tbl_candidates_header ch
  JOIN mechsoft.tbl_jd_header jh
    ON jh.jd_id = ch.jd_id
  JOIN mechsoft.tbl_candidate_score_header sh
    ON sh.candidate_id = ch.candidate_id AND sh.is_deleted = FALSE
  WHERE jh.company_id = p_company_id
    AND ch.is_deleted  = FALSE
    AND jh.is_deleted  = FALSE
    AND NOT EXISTS (
      SELECT 1
      FROM mechsoft.tbl_candidate_hr_feedbacks f
      WHERE f.candidate_id = ch.candidate_id
        AND f.is_deleted    = FALSE
    );

  -- ── Recent Activity ─────────────────────────────────────────
  -- UNION of 3 event sources, trimmed to last 10 by timestamp

  SELECT COALESCE(jsonb_agg(row_data.activity), '[]'::jsonb)
  INTO v_recent_activity
  FROM (
    SELECT activity, event_time
    FROM (
      (
        SELECT
          jsonb_build_object(
            'type',        'candidate_applied',
            'description', 'New candidate applied for ' || COALESCE(jt.title, 'a position'),
            'event_time',  TO_CHAR(ch.created_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          ) AS activity,
          ch.created_date AS event_time
        FROM mechsoft.tbl_candidates_header ch
        JOIN mechsoft.tbl_jd_header jh ON jh.jd_id = ch.jd_id
        LEFT JOIN public.mst_jobtitle jt ON jt.id = jh.job_title_id
        WHERE jh.company_id = p_company_id
          AND ch.is_deleted  = FALSE
          AND jh.is_deleted  = FALSE
        ORDER BY ch.created_date DESC
        LIMIT 5
      )
      UNION ALL
      (
        -- Only JDs that have been finalized (jd_theory is set)
        SELECT
          jsonb_build_object(
            'type',        'jd_published',
            'description', 'JD "' || COALESCE(jt.title, 'Untitled') || '" published',
            'event_time',  TO_CHAR(jcd.modified_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          ) AS activity,
          jcd.modified_date AS event_time
        FROM mechsoft.tbl_jd_header jh
        JOIN (
          SELECT DISTINCT ON (jd_id) jd_id, modified_date
          FROM mechsoft.tbl_jd_ai_chat_data
          WHERE is_deleted = FALSE
            AND jd_theory IS NOT NULL
            AND jd_theory  <> ''
          ORDER BY jd_id, modified_date DESC
        ) jcd ON jcd.jd_id = jh.jd_id
        LEFT JOIN public.mst_jobtitle jt ON jt.id = jh.job_title_id
        WHERE jh.company_id = p_company_id
          AND jh.is_deleted  = FALSE
        ORDER BY jcd.modified_date DESC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT
          jsonb_build_object(
            'type',        'profile_updated',
            'description', 'Company profile updated',
            'event_time',  TO_CHAR(cph.modified_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          ) AS activity,
          cph.modified_date AS event_time
        FROM mechsoft.company_profile_header cph
        WHERE cph.company_id = p_company_id
          AND cph.is_deleted  = FALSE
        ORDER BY cph.modified_date DESC
        LIMIT 1
      )
    ) all_events
    ORDER BY event_time DESC
    LIMIT 10
  ) row_data;

  RETURN jsonb_build_object(
    'stats', jsonb_build_object(
      'total_jobs',        v_total_jobs,
      'total_candidates',  v_total_candidates,
      'active_interviews', v_active_interviews,
      'hired_this_month',  v_hired_this_month,
      'pending_reviews',   v_pending_reviews
    ),
    'recent_activity', v_recent_activity
  );

END;
$$;
