-- ============================================================
-- Chat Assistant — tables, functions and sidebar menu entry
-- Run in database: Resume_Tracker. Safe to run more than once.
--
-- WHO WRITES / WHO READS
--   Python saves everything with mechsoft.fn_chat_save_message.
--   The Node backend never writes — it only reads with
--   fn_chat_get_sessions (chat list) and fn_chat_get_messages (chat history).
--
-- One chat      = one row in mechsoft.tbl_chat_session (session_id = Python's id)
-- One question  = one row in mechsoft.tbl_chat_message.
--                 message_id          = the question_id Python uses (created by the first save)
--                 status              = Python's latest status
--                 needs_clarification = Python's needs_correction (TRUE = the question was
--                                       rewritten / questioned, FALSE = answered directly)
--                 question, requests and responses are all in the `data` column:
--   {
--     "question": "python candidates applied recently",
--     "history": [
--       { "message_type": "ask",   "request": {...}, "response": {...}, "http_status": 200,
--         "elapsed_ms": 812, "request_date": "...", "response_date": "..." },
--       { "message_type": "reply", "request": {...}, "response": {...}, ... }
--     ]
--   }
--   history = every /ask and /reply of this question, in order.
--
-- Called by:
--   Python            → mechsoft.fn_chat_save_message
--   Node (read only)  → src/modules/chatAssistant/repositories/chatAssistant.repository.ts
-- ============================================================


-- ------------------------------------------------------------
-- 0. Remove earlier (unreleased) versions of the chat objects, if they were run.
--    Tables are dropped only when they still have an old shape.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS mechsoft.fn_chat_save_turn(INT, INT, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, INT, INT);
-- earlier fn_chat_save_message took question_id as VARCHAR — the new one takes message_id BIGINT
DROP FUNCTION IF EXISTS mechsoft.fn_chat_save_message(INT, INT, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, INT, INT);
DROP FUNCTION IF EXISTS mechsoft.fn_chat_get_turns(INT, INT, VARCHAR);
DROP FUNCTION IF EXISTS mechsoft.fn_chat_start_retry(INT, INT, BIGINT, INT);
DROP FUNCTION IF EXISTS mechsoft.fn_chat_cancel(INT, INT, BIGINT);
DROP FUNCTION IF EXISTS mechsoft.fn_chat_save_step_failure(INT, INT, BIGINT, SMALLINT, TEXT);
DROP FUNCTION IF EXISTS mechsoft.fn_chat_save_api2_result(INT, INT, BIGINT, JSONB);
DROP FUNCTION IF EXISTS mechsoft.fn_chat_save_api1_result(INT, INT, BIGINT, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS mechsoft.fn_chat_reply(INT, INT, BIGINT, VARCHAR, TEXT, INT);
DROP FUNCTION IF EXISTS mechsoft.fn_chat_ask(INT, INT, UUID, TEXT, INT);
DROP FUNCTION IF EXISTS mechsoft.fn_chat_get_message(INT, INT, BIGINT);
DROP FUNCTION IF EXISTS mechsoft.fn_chat_get_messages(INT, INT, UUID);
DROP FUNCTION IF EXISTS mechsoft.fn_chat_get_sessions(INT, INT, INT);
DROP TABLE IF EXISTS mechsoft.tbl_chat_turn;

DO $$
BEGIN
  -- First version of tbl_chat_message (had failed_step) and its helper function
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'mechsoft' AND table_name = 'tbl_chat_message' AND column_name = 'failed_step'
  ) THEN
    DROP FUNCTION IF EXISTS mechsoft.fn_chat_message_json(mechsoft.tbl_chat_message);
    DROP TABLE mechsoft.tbl_chat_message;
  END IF;

  -- Earlier versions of tbl_chat_session had no `id` column
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'mechsoft' AND table_name = 'tbl_chat_session'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'mechsoft' AND table_name = 'tbl_chat_session' AND column_name = 'id'
  ) THEN
    DROP TABLE mechsoft.tbl_chat_session;
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mechsoft.tbl_chat_session (
  id            BIGSERIAL    PRIMARY KEY,
  session_id    VARCHAR(50)   UNIQUE,      -- Python's unique id, e.g. s_71c0a2b9e4f1
  company_id    INT         ,
  user_id       INT          ,
  is_deleted    BOOLEAN       DEFAULT FALSE,
  created_by    INT,
  created_date  TIMESTAMP     DEFAULT NOW(),
  modified_by   INT,
  modified_date TIMESTAMP
);


CREATE INDEX IF NOT EXISTS ix_chat_session_owner
  ON mechsoft.tbl_chat_session (company_id, user_id, is_deleted);

CREATE TABLE IF NOT EXISTS mechsoft.tbl_chat_message (
  message_id      BIGSERIAL    PRIMARY KEY,        -- = Python's question_id
  chat_session_id BIGINT       ,
  status              VARCHAR(20),                 -- 'processing' or Python's latest status
  needs_clarification BOOLEAN,                     -- response.needs_correction; NULL until the first response
  data                JSONB        ,       -- question, history (see header)
  is_deleted      BOOLEAN      DEFAULT FALSE,
  created_by      INT,
  created_date    TIMESTAMP    DEFAULT NOW(),
  modified_by     INT,
  modified_date   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_chat_message_session
  ON mechsoft.tbl_chat_message (chat_session_id, is_deleted, message_id);


-- ------------------------------------------------------------
-- fn_chat_save_message   ← CALLED BY PYTHON
--
-- The returned message_id IS the question_id: Python puts it in its response
-- and receives it back in /reply.
--
-- Call it twice for every /ask and /reply:
--   1. When the request arrives → p_response = NULL
--        /ask   : p_message_id = NULL
--                 → chat session created on first use, new tbl_chat_message row
--                   (status 'processing'); returns the new message_id = question_id
--        /reply : p_message_id = question_id from the request
--                 → the reply is added to that row's data.history
--   2. When the response is ready → same parameters + p_message_id + p_response
--        → the response is saved against the request saved in step 1
--        → status = response.status, needs_clarification = response.needs_correction
-- For /ask, step 1 is required (the question_id does not exist before it).
-- For /reply, request and response may also be saved in ONE call.
--
-- Parameters
--   p_company_id    company_id from the request
--   p_user_id       user_id from the request
--   p_session_id    Python's session_id (new or existing)
--   p_message_id    question_id — NULL only when saving a new /ask request
--   p_message_type  'ask' or 'reply'
--   p_request       the request body as JSON
--   p_response      the response body as JSON, or NULL when only the request is saved
--   p_http_status   HTTP status sent back with the response (200, 404, 409, 410, 422)
--   p_elapsed_ms    response.elapsed_ms
--
-- Returns { success, message_id } or { success: false, error_code, message }
--
-- Example (Python, psycopg):
--   save = "SELECT mechsoft.fn_chat_save_message(%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)"
--   # /ask — 1. request arrived → get the question_id
--   cur.execute(save, (company_id, user_id, session_id, None, 'ask',
--                      json.dumps(request_body), None, None, None))
--   question_id = cur.fetchone()[0]['message_id']
--   # /ask — 2. response ready (response_body.question_id = question_id)
--   cur.execute(save, (company_id, user_id, session_id, question_id, 'ask',
--                      json.dumps(request_body), json.dumps(response_body), 200, elapsed_ms))
--   # /reply — same two calls with p_message_id = request_body['question_id'] and 'reply'
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_chat_save_message(INT, INT, VARCHAR, BIGINT, VARCHAR, JSONB, JSONB, INT, INT);
CREATE OR REPLACE FUNCTION mechsoft.fn_chat_save_message(
  p_company_id   INT     DEFAULT NULL,
  p_user_id      INT     DEFAULT NULL,
  p_session_id   VARCHAR DEFAULT NULL,
  p_message_id   BIGINT  DEFAULT NULL,
  p_message_type VARCHAR DEFAULT NULL,
  p_request      JSONB   DEFAULT NULL,
  p_response     JSONB   DEFAULT NULL,
  p_http_status  INT     DEFAULT NULL,
  p_elapsed_ms   INT     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_chat_id       BIGINT;
  v_owner_company INT;
  v_owner_user    INT;
  v_message_id    BIGINT;
  v_history       JSONB;
  v_last_index    INT;
  v_last_entry    JSONB;
  v_status        VARCHAR := COALESCE(p_response ->> 'status', 'processing');
  -- response.needs_correction (NULL when only the request is saved or the field is null)
  v_needs_clarification BOOLEAN := (p_response ->> 'needs_correction')::BOOLEAN;
BEGIN
  IF p_company_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error_code', 'VALIDATION', 'message', 'company_id and user_id are required');
  END IF;

  IF NULLIF(TRIM(p_session_id), '') IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error_code', 'VALIDATION', 'message', 'session_id is required');
  END IF;

  IF COALESCE(p_message_type, '') NOT IN ('ask', 'reply') THEN
    RETURN jsonb_build_object('success', FALSE, 'error_code', 'VALIDATION', 'message', 'message_type must be ask or reply');
  END IF;

  IF p_request IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error_code', 'VALIDATION', 'message', 'request is required');
  END IF;

  IF p_message_type = 'reply' AND p_message_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error_code', 'VALIDATION', 'message', 'message_id (question_id) is required for a reply');
  END IF;

  -- ── Chat session (row lock: saves of the same chat run one after the other) ──
  SELECT s.id, s.company_id, s.user_id INTO v_chat_id, v_owner_company, v_owner_user
  FROM   mechsoft.tbl_chat_session s
  WHERE  s.session_id = p_session_id
  FOR UPDATE;

  IF v_chat_id IS NULL THEN
    INSERT INTO mechsoft.tbl_chat_session (
      session_id, company_id, user_id,
      is_deleted, created_by, created_date, modified_by, modified_date
    )
    VALUES (
      p_session_id, p_company_id, p_user_id,
      FALSE, p_user_id, NOW(), NULL, NULL
    )
    RETURNING id INTO v_chat_id;
  ELSIF v_owner_company <> p_company_id OR v_owner_user <> p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error_code', 'FORBIDDEN', 'message', 'Session belongs to another user');
  ELSE
    UPDATE mechsoft.tbl_chat_session
    SET    modified_by   = p_user_id,
           modified_date = NOW()
    WHERE  id = v_chat_id;
  END IF;

  -- ── Chat message row of this question (message_id = question_id) ──
  IF p_message_id IS NOT NULL THEN
    SELECT m.message_id, COALESCE(m.data -> 'history', '[]'::jsonb)
    INTO   v_message_id, v_history
    FROM   mechsoft.tbl_chat_message m
    WHERE  m.message_id      = p_message_id
      AND  m.chat_session_id = v_chat_id
      AND  m.is_deleted      = FALSE
    FOR UPDATE;

    IF v_message_id IS NULL THEN
      RETURN jsonb_build_object('success', FALSE, 'error_code', 'NOT_FOUND', 'message', 'Question not found in this session');
    END IF;
  END IF;

  -- New /ask request → new row; its message_id becomes the question_id
  IF v_message_id IS NULL THEN
    INSERT INTO mechsoft.tbl_chat_message (
      chat_session_id, status, needs_clarification, data,
      is_deleted, created_by, created_date, modified_by, modified_date
    )
    VALUES (
      v_chat_id,
      v_status,
      v_needs_clarification,
      jsonb_build_object(
        'question',    NULLIF(TRIM(COALESCE(p_request ->> 'question', p_response ->> 'original_question')), ''),
        'history',     jsonb_build_array(jsonb_build_object(
          'message_type',  p_message_type,
          'request',       p_request,
          'response',      p_response,
          'http_status',   p_http_status,
          'elapsed_ms',    p_elapsed_ms,
          'request_date',  to_jsonb(NOW()::TIMESTAMP),
          'response_date', CASE WHEN p_response IS NULL THEN NULL ELSE to_jsonb(NOW()::TIMESTAMP) END
        ))
      ),
      FALSE, p_user_id, NOW(), NULL, NULL
    )
    RETURNING message_id INTO v_message_id;

    RETURN jsonb_build_object('success', TRUE, 'message_id', v_message_id);
  END IF;

  v_last_index := jsonb_array_length(v_history) - 1;
  v_last_entry := CASE WHEN v_last_index >= 0 THEN v_history -> v_last_index ELSE NULL END;

  IF p_response IS NOT NULL
     AND v_last_entry IS NOT NULL
     AND v_last_entry ->> 'message_type' = p_message_type
     AND jsonb_typeof(v_last_entry -> 'response') IS DISTINCT FROM 'object' THEN
    -- Response for the request saved earlier → fill it in
    v_history := jsonb_set(
      v_history,
      ARRAY[v_last_index::TEXT],
      v_last_entry || jsonb_build_object(
        'response',      p_response,
        'http_status',   p_http_status,
        'elapsed_ms',    p_elapsed_ms,
        'response_date', to_jsonb(NOW()::TIMESTAMP)
      )
    );
  ELSE
    -- New request of this question (a reply), with or without its response
    v_history := v_history || jsonb_build_array(jsonb_build_object(
      'message_type',  p_message_type,
      'request',       p_request,
      'response',      p_response,
      'http_status',   p_http_status,
      'elapsed_ms',    p_elapsed_ms,
      'request_date',  to_jsonb(NOW()::TIMESTAMP),
      'response_date', CASE WHEN p_response IS NULL THEN NULL ELSE to_jsonb(NOW()::TIMESTAMP) END
    ));
  END IF;

  UPDATE mechsoft.tbl_chat_message
  SET    data                = jsonb_set(data, '{history}', v_history),
         status              = v_status,
         -- a request-only save has no response → keep the last known value
         needs_clarification = COALESCE(v_needs_clarification, needs_clarification),
         modified_by   = p_user_id,
         modified_date = NOW()
  WHERE  message_id = v_message_id;

  RETURN jsonb_build_object('success', TRUE, 'message_id', v_message_id);
END;
$$;


-- ------------------------------------------------------------
-- fn_chat_get_sessions   ← Node (read only)
-- Chat list of the logged-in user, newest activity first.
-- title = the first question of the chat (no title column is stored).
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_chat_get_sessions(INT, INT);
CREATE OR REPLACE FUNCTION mechsoft.fn_chat_get_sessions(
  p_company_id INT,
  p_user_id    INT
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'session_id',    s.session_id,
        'title',         first_msg.question,
        'created_date',  s.created_date,
        'modified_date', s.modified_date
      )
      ORDER BY COALESCE(s.modified_date, s.created_date) DESC, s.id DESC
    ),
    '[]'::jsonb
  )
  FROM mechsoft.tbl_chat_session s
  LEFT JOIN LATERAL (
    SELECT m.data ->> 'question' AS question
    FROM   mechsoft.tbl_chat_message m
    WHERE  m.chat_session_id = s.id
      AND  m.is_deleted = FALSE
    ORDER  BY m.message_id
    LIMIT  1
  ) first_msg ON TRUE
  WHERE s.company_id = p_company_id
    AND s.user_id    = p_user_id
    AND s.is_deleted = FALSE;
$$;


-- ------------------------------------------------------------
-- fn_chat_get_messages   ← Node (read only)
-- History of one chat: every ask / reply that has a response, in order
-- (question by question). result.sql is removed so SQL never reaches the browser.
-- A request still waiting for its response is left out until it is answered.
-- Returns { success, data: { session_id, messages: [...] } } or NOT_FOUND.
-- ------------------------------------------------------------
-- DROP FUNCTION IF EXISTS mechsoft.fn_chat_get_messages(INT, INT, VARCHAR);
CREATE OR REPLACE FUNCTION mechsoft.fn_chat_get_messages(
  p_company_id INT,
  p_user_id    INT,
  p_session_id VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_chat_id  BIGINT;
  v_messages JSONB;
BEGIN
  SELECT s.id INTO v_chat_id
  FROM   mechsoft.tbl_chat_session s
  WHERE  s.session_id = p_session_id
    AND  s.company_id = p_company_id
    AND  s.user_id    = p_user_id
    AND  s.is_deleted = FALSE;

  IF v_chat_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error_code', 'NOT_FOUND', 'message', 'Chat not found');
  END IF;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',            m.message_id || '-' || h.position,
               'question_id',   m.message_id,
               'message_type',  h.entry ->> 'message_type',
               'request',       h.entry -> 'request',
               'response',      (h.entry -> 'response') #- '{result,sql}',
               'http_status',   h.entry -> 'http_status',
               'created_date',  h.entry -> 'request_date'
             )
             ORDER BY m.message_id, h.position
           ),
           '[]'::jsonb
         )
  INTO   v_messages
  FROM   mechsoft.tbl_chat_message m
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.data -> 'history', '[]'::jsonb))
         WITH ORDINALITY AS h(entry, position)
  WHERE  m.chat_session_id = v_chat_id
    AND  m.is_deleted = FALSE
    AND  jsonb_typeof(h.entry -> 'response') = 'object';

  RETURN jsonb_build_object(
    'success', TRUE,
    'data', jsonb_build_object('session_id', p_session_id, 'messages', v_messages)
  );
END;
$$;


-- ------------------------------------------------------------
-- 2. Sidebar menu entry (same pattern as reports-menu.sql)
-- ------------------------------------------------------------

-- Page (flat menu item; the UI picks the icon from routeIconMap)
INSERT INTO public.mst_masterpages
    (parent_id, page_name, routelink, icon, display_order,
     is_active, is_parent, is_deleted, created_by, created_date)
SELECT
    0, 'Chat Assistant', '/assistant', NULL,
    (SELECT COALESCE(MAX(display_order), 0) + 1 FROM public.mst_masterpages),
    TRUE, TRUE, FALSE, 1, NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM public.mst_masterpages
    WHERE routelink = '/assistant' AND is_deleted = FALSE
);

-- Permissions — every role of the company gets every permission on the page.
-- To limit it, add e.g.:  AND r.role_id IN (1, 2)
INSERT INTO public.tbl_role_permission (role_id, page_id, permission_id, is_allowed)
SELECT r.role_id, m.page_id, perm.permission_id, TRUE
FROM public.tbl_roles r
CROSS JOIN public.mst_masterpages m
CROSS JOIN public.mst_permission perm
WHERE r.company_id = 1                      -- your company_id
  AND m.routelink = '/assistant'
  AND m.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM public.tbl_role_permission rp
      WHERE rp.role_id       = r.role_id
        AND rp.page_id       = m.page_id
        AND rp.permission_id = perm.permission_id
  );

-- Check
-- SELECT page_id, page_name, routelink, display_order FROM public.mst_masterpages WHERE routelink = '/assistant';
-- SELECT mechsoft.fn_chat_get_sessions(1, 1);
-- SELECT mechsoft.fn_chat_get_messages(1, 1, 's_71c0a2b9e4f1');
