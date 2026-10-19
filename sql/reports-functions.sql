-- ============================================================
-- AI Usage report — PostgreSQL functions
-- Run in database: Resume_Tracker
-- Requires: sql/reports-audit-fdw-setup.sql (foreign table mechsoft.v_hr_tracker_audit)
--
-- Called by src/modules/reports/repositories/reports.repository.ts
--
-- Notes:
--   SET statement_timeout = '30s'  These functions read aesservice through
--       postgres_fdw; the timeout stops the API from hanging if that DB is
--       slow or unreachable. It applies only while the function runs.
--   fn_ai_usage_resolved_calls     Shared helper so JD / candidate resolution
--       is written once and reused by the report functions (db_rules §9).
--
-- Re-running this file:
--   CREATE OR REPLACE cannot change a function's return type or parameters.
--   If that error appears, uncomment and run the DROP lines below first,
--   then run the whole file again.
--
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_ai_usage_jds(INT, DATE, DATE, INT[]);
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_ai_usage_jd_processes(INT, INT, BOOLEAN, DATE, DATE);
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_ai_usage_jd_candidates(INT, INT, BOOLEAN, DATE, DATE, INT, INT);
-- DROP FUNCTION IF EXISTS mechsoft.fn_ai_usage_resolved_calls(INT, DATE, DATE);
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_ai_usage_jd_dropdown(INT);
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_ai_usage_export(INT, INT, DATE, DATE, INT[]);
-- ============================================================

-- ------------------------------------------------------------
-- fn_ai_usage_resolved_calls
-- One row per HR Tracker LLM call for a company + date range,
-- linked to its JD and candidate. Shared by the report functions below.
--   JD        = metadata.jd_id, else the candidate's jd_id,
--               else the JD whose session_id = metadata.session_id.
--   Candidate = matched by jd_id + candidate_id (the call's jd_id must be the
--               candidate's JD; candidate calls without jd_id are ignored),
--               else by jd_id + resume_file_name = metadata.filename.
--   person_key = one key per real person, so re-uploads of the same resume
--               (several candidate_ids) are shown as one candidate:
--               lower(email), else lower(full_name), else 'id:<candidate_id>'.
--   Calls of deleted candidates / deleted JDs are excluded (db_rules §6).
--   Calls that cannot be linked to a JD of this company are excluded.
--   Calls about a candidate (metadata has candidate_id or filename) count only
--   when that candidate exists for the JD; other calls are JD-level work.
--   Date filter (p_from_date / p_to_date) = the JD's created date
--               (tbl_jd_header.created_date, IST, both days inclusive).
--               All AI calls of those JDs are returned, whenever they ran.
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_ai_usage_resolved_calls(INT, DATE, DATE);
CREATE OR REPLACE FUNCTION mechsoft.fn_ai_usage_resolved_calls(
  p_company_id INT,
  p_from_date  DATE DEFAULT NULL,
  p_to_date    DATE DEFAULT NULL
)
RETURNS TABLE (
  jd_id         INT,
  candidate_id  BIGINT,
  person_key    TEXT,
  module        VARCHAR,
  feature       VARCHAR,
  is_failed     BOOLEAN,
  input_tokens  BIGINT,
  output_tokens BIGINT,
  total_tokens  BIGINT,
  total_cost    NUMERIC
)
LANGUAGE plpgsql
SET statement_timeout = '30s'
-- #variable_conflict: output column names (jd_id, module, …) match table
-- columns used below; plpgsql reads them as columns, not output variables.
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH calls AS (
    SELECT
      a.module::VARCHAR                          AS module,
      COALESCE(a.feature, a.module)::VARCHAR     AS feature,
      (a.status <> 'success')                    AS is_failed,
      COALESCE(a.prompt_tokens, 0)::BIGINT       AS input_tokens,
      COALESCE(a.completion_tokens, 0)::BIGINT   AS output_tokens,
      COALESCE(a.total_tokens, 0)::BIGINT        AS total_tokens,
      COALESCE(a.total_cost, 0)::NUMERIC         AS total_cost,
      CASE WHEN a.metadata->>'jd_id' ~ '^[0-9]+$'
           THEN (a.metadata->>'jd_id')::INT END           AS meta_jd_id,
      CASE WHEN a.metadata->>'candidate_id' ~ '^[0-9]+$'
           THEN (a.metadata->>'candidate_id')::BIGINT END AS meta_candidate_id,
      NULLIF(a.metadata->>'session_id', '')               AS meta_session_id,
      NULLIF(a.metadata->>'filename', '')                 AS meta_filename
    FROM mechsoft.v_hr_tracker_audit a
    WHERE a.organization_id = p_company_id::TEXT
  ),
  linked AS (
    SELECT
      c.module, c.feature, c.is_failed,
      c.input_tokens, c.output_tokens, c.total_tokens, c.total_cost,
      (c.meta_candidate_id IS NOT NULL
        OR c.meta_filename IS NOT NULL)                   AS is_candidate_call,
      COALESCE(ch.candidate_id, fc.candidate_id)          AS cand_id,
      COALESCE(ch.is_deleted, fc.is_deleted)              AS cand_deleted,
      COALESCE(ch.jd_id, fc.jd_id)::INT                   AS cand_jd_id,
      COALESCE(c.meta_jd_id, ch.jd_id::INT, sj.jd_id)     AS resolved_jd_id
    FROM calls c
    -- candidate by jd_id + candidate_id (AI evaluation / scoring):
    --   the call's jd_id must be the candidate's JD; rows without jd_id are ignored.
    LEFT JOIN mechsoft.tbl_candidates_header ch
           ON ch.candidate_id = c.meta_candidate_id
          AND ch.jd_id        = c.meta_jd_id
    -- candidate by jd_id + filename (resume extraction runs before the candidate exists)
    LEFT JOIN LATERAL (
      SELECT x.candidate_id, x.is_deleted, x.jd_id
      FROM mechsoft.tbl_candidates_header x
      WHERE c.meta_candidate_id IS NULL
        AND c.meta_filename     IS NOT NULL
        AND x.jd_id            = c.meta_jd_id
        AND x.resume_file_name = c.meta_filename
      ORDER BY x.candidate_id DESC
      LIMIT 1
    ) fc ON TRUE
    -- JD by session_id (JD creation chat runs before the JD is saved)
    LEFT JOIN LATERAL (
      SELECT j.jd_id
      FROM mechsoft.tbl_jd_header j
      WHERE c.meta_jd_id      IS NULL
        AND c.meta_session_id IS NOT NULL
        AND j.session_id = c.meta_session_id
        AND j.company_id = p_company_id
      ORDER BY j.jd_id DESC
      LIMIT 1
    ) sj ON TRUE
  )
  SELECT
    h.jd_id               AS jd_id,
    l.cand_id             AS candidate_id,
    CASE WHEN l.cand_id IS NULL THEN NULL
         ELSE COALESCE(NULLIF(LOWER(TRIM(pc.email)), ''),
                       NULLIF(LOWER(TRIM(pc.full_name)), ''),
                       'id:' || l.cand_id)
    END                   AS person_key,
    l.module,
    l.feature,
    l.is_failed,
    l.input_tokens,
    l.output_tokens,
    l.total_tokens,
    l.total_cost
  FROM linked l
  LEFT JOIN mechsoft.tbl_jd_header h
         ON h.jd_id      = l.resolved_jd_id
        AND h.company_id = p_company_id
  LEFT JOIN mechsoft.tbl_candidates_header pc
         ON pc.candidate_id = l.cand_id
  WHERE COALESCE(l.cand_deleted, FALSE) = FALSE   -- active candidates only
    AND h.jd_id IS NOT NULL                       -- only calls linked to a JD
    AND h.is_deleted = FALSE                      -- active JDs only
    -- date filter on the JD's created date (stored as IST, no time zone)
    AND (p_from_date IS NULL OR h.created_date >= p_from_date)
    AND (p_to_date   IS NULL OR h.created_date <  p_to_date + 1)
    AND (l.cand_id IS NULL                        -- candidate calls: only for
         OR l.cand_jd_id = h.jd_id)               -- that candidate's own JD
    AND (NOT l.is_candidate_call                  -- calls about a candidate (candidate_id /
         OR l.cand_id IS NOT NULL);               -- filename) count only when that candidate exists
END;
$$;

-- ------------------------------------------------------------
-- fn_get_ai_usage_jds
-- Stat cards + JD grid.
-- Returns { summary: {total_jds, total_candidates, calls, failed_calls,
--                     input_tokens, output_tokens, total_tokens, total_cost},
--           list: [{jd_id, jd_name, created_date, candidate_count, calls,
--                   failed_calls, input_tokens, output_tokens, total_tokens, total_cost}] }
-- p_jd_ids NULL / empty = all JDs.
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_ai_usage_jds(INT, DATE, DATE, INT[]);
CREATE OR REPLACE FUNCTION mechsoft.fn_get_ai_usage_jds(
  p_company_id INT,
  p_from_date  DATE  DEFAULT NULL,
  p_to_date    DATE  DEFAULT NULL,
  p_jd_ids     INT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET statement_timeout = '30s'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH r AS (
    SELECT rc.*
    FROM mechsoft.fn_ai_usage_resolved_calls(p_company_id, p_from_date, p_to_date) rc
    WHERE p_jd_ids IS NULL
       OR cardinality(p_jd_ids) = 0
       OR rc.jd_id = ANY (p_jd_ids)
  ),
  per_jd AS (
    SELECT
      r.jd_id,
      COUNT(DISTINCT r.person_key)         AS candidate_count,
      COUNT(*)                             AS calls,
      COUNT(*) FILTER (WHERE r.is_failed)  AS failed_calls,
      SUM(r.input_tokens)                  AS input_tokens,
      SUM(r.output_tokens)                 AS output_tokens,
      SUM(r.total_tokens)                  AS total_tokens,
      SUM(r.total_cost)                    AS total_cost
    FROM r
    GROUP BY r.jd_id
  )
  SELECT jsonb_build_object(
    'summary', (
      SELECT jsonb_build_object(
        'total_jds',        COUNT(DISTINCT r.jd_id),
        -- per JD: a person in 2 JDs counts once in each (= sum of the JD rows)
        'total_candidates', COUNT(DISTINCT r.jd_id::TEXT || '|' || r.person_key),
        'calls',            COUNT(*),
        'failed_calls',     COUNT(*) FILTER (WHERE r.is_failed),
        'input_tokens',     COALESCE(SUM(r.input_tokens), 0),
        'output_tokens',    COALESCE(SUM(r.output_tokens), 0),
        'total_tokens',     COALESCE(SUM(r.total_tokens), 0),
        'total_cost',       COALESCE(SUM(r.total_cost), 0)
      )
      FROM r
    ),
    'list', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'jd_id',           p.jd_id,
        -- Same label as fn_get_jd_dropdown: seniority + job title
        'jd_name',         NULLIF(CONCAT_WS(' ', s.name, jt.title), ''),
        'created_date',    h.created_date,
        'candidate_count', p.candidate_count,
        'calls',           p.calls,
        'failed_calls',    p.failed_calls,
        'input_tokens',    p.input_tokens,
        'output_tokens',   p.output_tokens,
        'total_tokens',    p.total_tokens,
        'total_cost',      p.total_cost
      ) ORDER BY (p.jd_id IS NULL), CONCAT_WS(' ', s.name, jt.title), p.jd_id)
      FROM per_jd p
      LEFT JOIN mechsoft.tbl_jd_header h  ON h.jd_id = p.jd_id
      LEFT JOIN public.mst_seniority   s  ON s.id    = h.seniority_id
      LEFT JOIN public.mst_jobtitle    jt ON jt.id   = h.job_title_id
    ), '[]'::JSONB)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- fn_get_ai_usage_jd_processes
-- JD-level calls (no candidate): main process (module) → sub-processes (feature).
-- Returns [{module, calls, failed_calls, input_tokens, output_tokens,
--           total_tokens, total_cost, features: [{feature, ...same totals}]}]
-- p_unassigned = TRUE → calls not linked to any JD (p_jd_id ignored).
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_ai_usage_jd_processes(INT, INT, BOOLEAN, DATE, DATE);
CREATE OR REPLACE FUNCTION mechsoft.fn_get_ai_usage_jd_processes(
  p_company_id INT,
  p_jd_id      INT     DEFAULT NULL,
  p_unassigned BOOLEAN DEFAULT FALSE,
  p_from_date  DATE    DEFAULT NULL,
  p_to_date    DATE    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET statement_timeout = '30s'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH r AS (
    SELECT rc.*
    FROM mechsoft.fn_ai_usage_resolved_calls(p_company_id, p_from_date, p_to_date) rc
    WHERE rc.candidate_id IS NULL
      AND CASE WHEN p_unassigned THEN rc.jd_id IS NULL ELSE rc.jd_id = p_jd_id END
  ),
  f AS (
    SELECT
      r.module, r.feature,
      COUNT(*)                             AS calls,
      COUNT(*) FILTER (WHERE r.is_failed)  AS failed_calls,
      SUM(r.input_tokens)                  AS input_tokens,
      SUM(r.output_tokens)                 AS output_tokens,
      SUM(r.total_tokens)                  AS total_tokens,
      SUM(r.total_cost)                    AS total_cost
    FROM r
    GROUP BY r.module, r.feature
  ),
  m AS (
    SELECT
      f.module,
      SUM(f.calls)          AS calls,
      SUM(f.failed_calls)   AS failed_calls,
      SUM(f.input_tokens)   AS input_tokens,
      SUM(f.output_tokens)  AS output_tokens,
      SUM(f.total_tokens)   AS total_tokens,
      SUM(f.total_cost)     AS total_cost,
      jsonb_agg(jsonb_build_object(
        'feature',       f.feature,
        'calls',         f.calls,
        'failed_calls',  f.failed_calls,
        'input_tokens',  f.input_tokens,
        'output_tokens', f.output_tokens,
        'total_tokens',  f.total_tokens,
        'total_cost',    f.total_cost
      ) ORDER BY f.feature) AS features
    FROM f
    GROUP BY f.module
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'module',        m.module,
    'calls',         m.calls,
    'failed_calls',  m.failed_calls,
    'input_tokens',  m.input_tokens,
    'output_tokens', m.output_tokens,
    'total_tokens',  m.total_tokens,
    'total_cost',    m.total_cost,
    'features',      m.features
  ) ORDER BY m.module), '[]'::JSONB)
  INTO v_result
  FROM m;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- fn_get_ai_usage_jd_candidates
-- Candidates of a JD (paged, newest first): candidate → module → feature.
-- One row per person (person_key): re-uploads of the same resume are merged.
-- Returns { total_count,
--           summary: {calls, failed_calls, input_tokens, output_tokens, total_tokens, total_cost},
--           list: [{candidate_id (first upload), full_name, uploaded_date (first upload),
--                   upload_count, candidate_ids, ...totals,
--                   processes: [same shape as fn_get_ai_usage_jd_processes]}] }
-- p_unassigned = TRUE → candidates whose calls are not linked to any JD.
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_ai_usage_jd_candidates(INT, INT, BOOLEAN, DATE, DATE, INT, INT);
CREATE OR REPLACE FUNCTION mechsoft.fn_get_ai_usage_jd_candidates(
  p_company_id INT,
  p_jd_id      INT     DEFAULT NULL,
  p_unassigned BOOLEAN DEFAULT FALSE,
  p_from_date  DATE    DEFAULT NULL,
  p_to_date    DATE    DEFAULT NULL,
  p_page       INT     DEFAULT 1,
  p_page_size  INT     DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SET statement_timeout = '30s'
AS $$
DECLARE
  v_page_size INT := GREATEST(COALESCE(p_page_size, 10), 1);
  v_offset    INT := (GREATEST(COALESCE(p_page, 1), 1) - 1) * GREATEST(COALESCE(p_page_size, 10), 1);
  v_result    JSONB;
BEGIN
  WITH r AS (
    SELECT rc.*
    FROM mechsoft.fn_ai_usage_resolved_calls(p_company_id, p_from_date, p_to_date) rc
    WHERE rc.candidate_id IS NOT NULL
      AND CASE WHEN p_unassigned THEN rc.jd_id IS NULL ELSE rc.jd_id = p_jd_id END
  ),
  -- One row per person: re-uploads of the same resume (several candidate_ids)
  -- are merged. Name = first non-empty name, date = first upload.
  people AS (
    SELECT
      i.person_key,
      MIN(i.candidate_id)                                      AS candidate_id,
      COUNT(*)                                                 AS upload_count,
      jsonb_agg(i.candidate_id ORDER BY i.candidate_id)        AS candidate_ids,
      (ARRAY_AGG(TRIM(ch.full_name) ORDER BY ch.candidate_id)
         FILTER (WHERE NULLIF(TRIM(ch.full_name), '') IS NOT NULL))[1] AS full_name,
      MIN(ch.created_date)                                     AS uploaded_date
    FROM (SELECT DISTINCT r.person_key, r.candidate_id FROM r) i
    JOIN mechsoft.tbl_candidates_header ch ON ch.candidate_id = i.candidate_id
    GROUP BY i.person_key
  ),
  per_person AS (
    SELECT
      r.person_key,
      COUNT(*)                             AS calls,
      COUNT(*) FILTER (WHERE r.is_failed)  AS failed_calls,
      SUM(r.input_tokens)                  AS input_tokens,
      SUM(r.output_tokens)                 AS output_tokens,
      SUM(r.total_tokens)                  AS total_tokens,
      SUM(r.total_cost)                    AS total_cost
    FROM r
    GROUP BY r.person_key
  ),
  paged AS (
    SELECT pe.*,
           pp.calls, pp.failed_calls, pp.input_tokens, pp.output_tokens,
           pp.total_tokens, pp.total_cost
    FROM people pe
    JOIN per_person pp ON pp.person_key = pe.person_key
    ORDER BY pe.uploaded_date DESC NULLS LAST, pe.candidate_id DESC
    LIMIT v_page_size OFFSET v_offset
  ),
  f AS (
    SELECT
      r.person_key, r.module, r.feature,
      COUNT(*)                             AS calls,
      COUNT(*) FILTER (WHERE r.is_failed)  AS failed_calls,
      SUM(r.input_tokens)                  AS input_tokens,
      SUM(r.output_tokens)                 AS output_tokens,
      SUM(r.total_tokens)                  AS total_tokens,
      SUM(r.total_cost)                    AS total_cost
    FROM r
    WHERE r.person_key IN (SELECT pg.person_key FROM paged pg)
    GROUP BY r.person_key, r.module, r.feature
  ),
  m AS (
    SELECT
      f.person_key, f.module,
      SUM(f.calls)          AS calls,
      SUM(f.failed_calls)   AS failed_calls,
      SUM(f.input_tokens)   AS input_tokens,
      SUM(f.output_tokens)  AS output_tokens,
      SUM(f.total_tokens)   AS total_tokens,
      SUM(f.total_cost)     AS total_cost,
      jsonb_agg(jsonb_build_object(
        'feature',       f.feature,
        'calls',         f.calls,
        'failed_calls',  f.failed_calls,
        'input_tokens',  f.input_tokens,
        'output_tokens', f.output_tokens,
        'total_tokens',  f.total_tokens,
        'total_cost',    f.total_cost
      ) ORDER BY f.feature) AS features
    FROM f
    GROUP BY f.person_key, f.module
  ),
  p AS (
    SELECT
      m.person_key,
      jsonb_agg(jsonb_build_object(
        'module',        m.module,
        'calls',         m.calls,
        'failed_calls',  m.failed_calls,
        'input_tokens',  m.input_tokens,
        'output_tokens', m.output_tokens,
        'total_tokens',  m.total_tokens,
        'total_cost',    m.total_cost,
        'features',      m.features
      ) ORDER BY m.module) AS processes
    FROM m
    GROUP BY m.person_key
  )
  SELECT jsonb_build_object(
    'total_count', (SELECT COUNT(*) FROM people),
    'summary', (
      SELECT jsonb_build_object(
        'calls',         COUNT(*),
        'failed_calls',  COUNT(*) FILTER (WHERE r.is_failed),
        'input_tokens',  COALESCE(SUM(r.input_tokens), 0),
        'output_tokens', COALESCE(SUM(r.output_tokens), 0),
        'total_tokens',  COALESCE(SUM(r.total_tokens), 0),
        'total_cost',    COALESCE(SUM(r.total_cost), 0)
      )
      FROM r
    ),
    'list', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'candidate_id',  pg.candidate_id,
        'full_name',     pg.full_name,
        'uploaded_date', pg.uploaded_date,
        'upload_count',  pg.upload_count,
        'candidate_ids', pg.candidate_ids,
        'calls',         pg.calls,
        'failed_calls',  pg.failed_calls,
        'input_tokens',  pg.input_tokens,
        'output_tokens', pg.output_tokens,
        'total_tokens',  pg.total_tokens,
        'total_cost',    pg.total_cost,
        'processes',     COALESCE(p.processes, '[]'::JSONB)
      ) ORDER BY pg.uploaded_date DESC NULLS LAST, pg.candidate_id DESC)
      FROM paged pg
      LEFT JOIN p ON p.person_key = pg.person_key
    ), '[]'::JSONB)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- fn_get_ai_usage_jd_dropdown
-- JD Name filter options for the AI Usage report: every JD of the company
-- that has AI usage, in any status (drafts included). Separate from
-- fn_get_jd_dropdown, which lists only 'ready' JDs for other screens.
-- Returns [{jd_id, label}] — label = seniority + job title.
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_ai_usage_jd_dropdown(INT);
CREATE OR REPLACE FUNCTION mechsoft.fn_get_ai_usage_jd_dropdown(
  p_company_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SET statement_timeout = '30s'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH used AS (
    SELECT DISTINCT rc.jd_id
    FROM mechsoft.fn_ai_usage_resolved_calls(p_company_id, NULL, NULL) rc
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'jd_id', h.jd_id,
    'label', CONCAT_WS(' ', s.name, jt.title)
  ) ORDER BY CONCAT_WS(' ', s.name, jt.title), h.jd_id), '[]'::JSONB)
  INTO v_result
  FROM used u
  JOIN mechsoft.tbl_jd_header      h  ON h.jd_id = u.jd_id
  LEFT JOIN public.mst_seniority   s  ON s.id    = h.seniority_id
  LEFT JOIN public.mst_jobtitle    jt ON jt.id   = h.job_title_id;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- fn_get_ai_usage_export
-- All data for the Excel export, with the same filters as fn_get_ai_usage_jds.
-- Flat rows (one per JD / JD × sub-process / JD × candidate × sub-process).
-- Returns { filters: {jd_names, created_by},
--           summary: {same as fn_get_ai_usage_jds.summary},
--           jds: [...], jd_processes: [...], candidates: [...] }
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_get_ai_usage_export(INT, INT, DATE, DATE, INT[]);
CREATE OR REPLACE FUNCTION mechsoft.fn_get_ai_usage_export(
  p_company_id INT,
  p_user_id    INT,
  p_from_date  DATE  DEFAULT NULL,
  p_to_date    DATE  DEFAULT NULL,
  p_jd_ids     INT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET statement_timeout = '60s'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH r AS (
    SELECT rc.*
    FROM mechsoft.fn_ai_usage_resolved_calls(p_company_id, p_from_date, p_to_date) rc
    WHERE p_jd_ids IS NULL
       OR cardinality(p_jd_ids) = 0
       OR rc.jd_id = ANY (p_jd_ids)
  ),
  jd_info AS (
    SELECT h.jd_id,
           NULLIF(CONCAT_WS(' ', s.name, jt.title), '') AS jd_name,
           h.created_date
    FROM mechsoft.tbl_jd_header h
    LEFT JOIN public.mst_seniority s  ON s.id  = h.seniority_id
    LEFT JOIN public.mst_jobtitle  jt ON jt.id = h.job_title_id
    WHERE h.company_id = p_company_id
  ),
  -- one row per person per JD (re-uploads merged, same as the Candidates grid)
  people AS (
    SELECT
      i.jd_id,
      i.person_key,
      MIN(i.candidate_id)                                             AS candidate_id,
      STRING_AGG(i.candidate_id::TEXT, ', ' ORDER BY i.candidate_id)  AS candidate_ids,
      (ARRAY_AGG(TRIM(ch.full_name) ORDER BY ch.candidate_id)
         FILTER (WHERE NULLIF(TRIM(ch.full_name), '') IS NOT NULL))[1] AS full_name,
      MIN(ch.created_date)                                            AS uploaded_date
    FROM (SELECT DISTINCT r.jd_id, r.person_key, r.candidate_id
          FROM r WHERE r.candidate_id IS NOT NULL) i
    JOIN mechsoft.tbl_candidates_header ch ON ch.candidate_id = i.candidate_id
    GROUP BY i.jd_id, i.person_key
  )
  SELECT jsonb_build_object(
    'filters', jsonb_build_object(
      'jd_names', COALESCE((
        SELECT jsonb_agg(n.jd_name ORDER BY n.jd_name)
        FROM jd_info n
        WHERE n.jd_id = ANY (p_jd_ids)
      ), '[]'::JSONB),
      'created_by', (
        -- employee name, else the login username (users without an employee record)
        SELECT COALESCE(NULLIF(TRIM(e.employee_name), ''), u.username)
        FROM public.mst_users u
        LEFT JOIN public.mst_employees e ON e.empid = u.empid
        WHERE u.user_id = p_user_id
      )
    ),
    'summary', (
      SELECT jsonb_build_object(
        'total_jds',        COUNT(DISTINCT r.jd_id),
        -- per JD: a person in 2 JDs counts once in each (= sum of the JD rows)
        'total_candidates', COUNT(DISTINCT r.jd_id::TEXT || '|' || r.person_key),
        'calls',            COUNT(*),
        'failed_calls',     COUNT(*) FILTER (WHERE r.is_failed),
        'input_tokens',     COALESCE(SUM(r.input_tokens), 0),
        'output_tokens',    COALESCE(SUM(r.output_tokens), 0),
        'total_tokens',     COALESCE(SUM(r.total_tokens), 0),
        'total_cost',       COALESCE(SUM(r.total_cost), 0)
      )
      FROM r
    ),
    'jds', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.jd_name, x.jd_id)
      FROM (
        SELECT
          r.jd_id,
          n.jd_name,
          n.created_date,
          COUNT(DISTINCT r.person_key)         AS candidate_count,
          COUNT(*)                             AS calls,
          COUNT(*) FILTER (WHERE r.is_failed)  AS failed_calls,
          SUM(r.input_tokens)                  AS input_tokens,
          SUM(r.output_tokens)                 AS output_tokens,
          SUM(r.total_tokens)                  AS total_tokens,
          SUM(r.total_cost)                    AS total_cost
        FROM r
        LEFT JOIN jd_info n ON n.jd_id = r.jd_id
        GROUP BY r.jd_id, n.jd_name, n.created_date
      ) x
    ), '[]'::JSONB),
    'jd_processes', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.jd_name, x.jd_id, x.module, x.feature)
      FROM (
        SELECT
          r.jd_id,
          n.jd_name,
          r.module,
          r.feature,
          COUNT(*)                             AS calls,
          COUNT(*) FILTER (WHERE r.is_failed)  AS failed_calls,
          SUM(r.input_tokens)                  AS input_tokens,
          SUM(r.output_tokens)                 AS output_tokens,
          SUM(r.total_tokens)                  AS total_tokens,
          SUM(r.total_cost)                    AS total_cost
        FROM r
        LEFT JOIN jd_info n ON n.jd_id = r.jd_id
        WHERE r.candidate_id IS NULL
        GROUP BY r.jd_id, n.jd_name, r.module, r.feature
      ) x
    ), '[]'::JSONB),
    'candidates', COALESCE((
      SELECT jsonb_agg(to_jsonb(x)
             ORDER BY x.jd_name, x.jd_id, x.uploaded_date DESC NULLS LAST, x.candidate_id, x.module, x.feature)
      FROM (
        SELECT
          r.jd_id,
          n.jd_name,
          pe.candidate_id,
          pe.full_name,
          pe.candidate_ids,
          pe.uploaded_date,
          r.module,
          r.feature,
          COUNT(*)                             AS calls,
          COUNT(*) FILTER (WHERE r.is_failed)  AS failed_calls,
          SUM(r.input_tokens)                  AS input_tokens,
          SUM(r.output_tokens)                 AS output_tokens,
          SUM(r.total_tokens)                  AS total_tokens,
          SUM(r.total_cost)                    AS total_cost
        FROM r
        JOIN people pe        ON pe.jd_id = r.jd_id AND pe.person_key = r.person_key
        LEFT JOIN jd_info n   ON n.jd_id  = r.jd_id
        GROUP BY r.jd_id, n.jd_name, pe.candidate_id, pe.full_name, pe.candidate_ids,
                 pe.uploaded_date, r.module, r.feature
      ) x
    ), '[]'::JSONB)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- Quick test (replace 1 with your company_id and 12 with a real jd_id)
-- ------------------------------------------------------------
-- SELECT mechsoft.fn_get_ai_usage_export(1, 1, NULL, NULL, NULL);
-- SELECT mechsoft.fn_get_ai_usage_jd_dropdown(1);
-- SELECT mechsoft.fn_get_ai_usage_jds(1, NULL, NULL, NULL);
-- SELECT mechsoft.fn_get_ai_usage_jds(1, '2026-09-01', '2026-10-12', ARRAY[12]);
-- SELECT mechsoft.fn_get_ai_usage_jd_processes(1, 12, FALSE, NULL, NULL);
-- SELECT mechsoft.fn_get_ai_usage_jd_candidates(1, 12, FALSE, NULL, NULL, 1, 10);
-- SELECT mechsoft.fn_get_ai_usage_jd_candidates(1, NULL, TRUE, NULL, NULL, 1, 10);  -- Unassigned
