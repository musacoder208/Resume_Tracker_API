-- ============================================================
-- HR DYNAMIC QUESTIONS SYSTEM
-- Tables: mechsoft.tbl_hr_question_groups
--         mechsoft.tbl_hr_questions
--         mechsoft.tbl_hr_question_options
--         mechsoft.tbl_candidate_hr_answers
-- ============================================================


-- ------------------------------------------------------------
-- TABLE 1: mechsoft.tbl_hr_question_groups
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mechsoft.tbl_hr_question_groups (
  group_id      BIGSERIAL    PRIMARY KEY,
  company_id    BIGINT       NOT NULL,
  group_name    VARCHAR(200) NOT NULL,
  display_order INT          DEFAULT 0,
  is_active     BOOLEAN      DEFAULT TRUE,
  is_deleted    BOOLEAN      DEFAULT FALSE,
  created_by    INT,
  created_date  TIMESTAMP    DEFAULT NOW(),
  modified_by   INT,
  modified_date TIMESTAMP
);


-- ------------------------------------------------------------
-- TABLE 2: mechsoft.tbl_hr_questions
-- question_key is UNIQUE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mechsoft.tbl_hr_questions (
  question_id   BIGSERIAL    PRIMARY KEY,
  company_id    BIGINT       NOT NULL,
  group_id      BIGINT,
  question_text VARCHAR(500) NOT NULL,
  question_key  VARCHAR(100) NOT NULL UNIQUE,
  input_type    VARCHAR(50)  NOT NULL,  -- textbox | textarea | single_select | multi_select
  is_required   BOOLEAN      DEFAULT FALSE,
  display_order INT          DEFAULT 0,
  is_active     BOOLEAN      DEFAULT TRUE,
  is_deleted    BOOLEAN      DEFAULT FALSE,
  created_by    INT,
  created_date  TIMESTAMP    DEFAULT NOW(),
  modified_by   INT,
  modified_date TIMESTAMP
);


-- ------------------------------------------------------------
-- TABLE 3: mechsoft.tbl_hr_question_options
-- Only for single_select and multi_select questions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mechsoft.tbl_hr_question_options (
  option_id     BIGSERIAL    PRIMARY KEY,
  company_id    BIGINT       NOT NULL,
  question_key  VARCHAR(100) NOT NULL,
  option_label  VARCHAR(200) NOT NULL,
  option_value  VARCHAR(100) NOT NULL,
  display_order INT          DEFAULT 0,
  is_active     BOOLEAN      DEFAULT TRUE,
  is_deleted    BOOLEAN      DEFAULT FALSE
);


-- ------------------------------------------------------------
-- TABLE 4: mechsoft.tbl_candidate_hr_answers
-- answer_text holds all values (text, single, multi as JSON string)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mechsoft.tbl_candidate_hr_answers (
  answer_id     BIGSERIAL    PRIMARY KEY,
  candidate_id  BIGINT       NOT NULL,
  question_key  VARCHAR(100) NOT NULL,
  answer_text   TEXT,
  created_by    INT,
  created_date  TIMESTAMP    DEFAULT NOW(),
  modified_by   INT,
  modified_date TIMESTAMP
);


-- ============================================================
-- SEED DATA
-- Replace company_id = 1 with your actual company_id
-- ============================================================


-- ------------------------------------------------------------
-- INSERT: mechsoft.tbl_hr_question_groups
-- ------------------------------------------------------------
INSERT INTO mechsoft.tbl_hr_question_groups
  (company_id, group_name, display_order, is_active, is_deleted)
VALUES
  (1, 'Previous Employer Detailed Section', 6, TRUE, FALSE);


-- ------------------------------------------------------------
-- INSERT: mechsoft.tbl_hr_questions
-- group_id = 1 for Previous Employer sub-questions
-- group_id = NULL for standalone questions
-- ------------------------------------------------------------
INSERT INTO mechsoft.tbl_hr_questions
  (company_id, group_id, question_text, question_key, input_type, is_required, display_order, is_active, is_deleted)
VALUES
  -- Standalone
  (1, NULL, 'Current Salary',    'current_salary',    'textbox',       FALSE, 1, TRUE, FALSE),
  (1, NULL, 'Expected Salary',   'expected_salary',   'textbox',       FALSE, 2, TRUE, FALSE),
  (1, NULL, 'Notice Period',     'notice_period',     'single_select', FALSE, 3, TRUE, FALSE),
  (1, NULL, 'Interview Update',  'interview_update',  'multi_select',  FALSE, 4, TRUE, FALSE),
  (1, NULL, 'Feedback Section',  'feedback_section',  'textarea',      FALSE, 5, TRUE, FALSE),
  (1, NULL, 'Final Selection',   'final_selection',   'single_select', FALSE, 6, TRUE, FALSE),
  -- Inside group (Previous Employer)
  (1, 1,    'PF Account',              'pf_account',        'single_select', FALSE, 1, TRUE, FALSE),
  (1, 1,    '6 Month Bank Statement',  'bank_statement_6m', 'single_select', FALSE, 2, TRUE, FALSE),
  (1, 1,    '3 Month Salary Slip',     'salary_slip_3m',    'single_select', FALSE, 3, TRUE, FALSE),
  (1, 1,    'Relieving Letter',        'relieving_letter',  'single_select', FALSE, 4, TRUE, FALSE),
  (1, 1,    'Experience Letter',       'experience_letter', 'single_select', FALSE, 5, TRUE, FALSE),
  -- Standalone (after group)
  (1, NULL, 'Comment Section',   'comment_section',   'textarea',      FALSE, 8, TRUE, FALSE);


-- ------------------------------------------------------------
-- INSERT: mechsoft.tbl_hr_question_options
-- ------------------------------------------------------------
INSERT INTO mechsoft.tbl_hr_question_options
  (company_id, question_key, option_label, option_value, display_order, is_active, is_deleted)
VALUES
  -- Notice Period
  (1, 'notice_period', 'Immediate Joiner',              'immediate',       1, TRUE, FALSE),
  (1, 'notice_period', 'Can Join within 15 days',       'within_15_days',  2, TRUE, FALSE),
  (1, 'notice_period', 'Can Join in less than 30 days', 'within_30_days',  3, TRUE, FALSE),
  (1, 'notice_period', 'Can Join in 45 Days',           'within_45_days',  4, TRUE, FALSE),
  (1, 'notice_period', 'More than 45 days',             'more_than_45',    5, TRUE, FALSE),

  -- Interview Update
  (1, 'interview_update', 'Rejected in Pre-screening',                      'rejected_prescreening', 1, TRUE, FALSE),
  (1, 'interview_update', 'Called and rejected post call',                  'rejected_post_call',    2, TRUE, FALSE),
  (1, 'interview_update', 'Called and shortlisted post call for 1st round', 'shortlisted_1st',       3, TRUE, FALSE),
  (1, 'interview_update', 'Rejected after 1st round',                       'rejected_1st',          4, TRUE, FALSE),
  (1, 'interview_update', 'Shortlisted for 2nd / 3rd round',                'shortlisted_2nd_3rd',   5, TRUE, FALSE),
  (1, 'interview_update', 'Rejected in 2nd / 3rd round',                    'rejected_2nd_3rd',      6, TRUE, FALSE),
  (1, 'interview_update', 'Called for F2F',                                 'called_f2f',            7, TRUE, FALSE),
  (1, 'interview_update', 'No show in Interview',                           'no_show',               8, TRUE, FALSE),

  -- Final Selection
  (1, 'final_selection', 'YES',                        'yes',              1, TRUE, FALSE),
  (1, 'final_selection', 'NO',                         'no',               2, TRUE, FALSE),
  (1, 'final_selection', 'Offer released and accepted', 'offer_accepted',  3, TRUE, FALSE),
  (1, 'final_selection', 'Offer released and didn''t join', 'offer_not_joined', 4, TRUE, FALSE),

  -- PF Account
  (1, 'pf_account', 'YES', 'yes', 1, TRUE, FALSE),
  (1, 'pf_account', 'NO',  'no',  2, TRUE, FALSE),

  -- 6 Month Bank Statement
  (1, 'bank_statement_6m', 'YES', 'yes', 1, TRUE, FALSE),
  (1, 'bank_statement_6m', 'NO',  'no',  2, TRUE, FALSE),

  -- 3 Month Salary Slip
  (1, 'salary_slip_3m', 'YES', 'yes', 1, TRUE, FALSE),
  (1, 'salary_slip_3m', 'NO',  'no',  2, TRUE, FALSE),

  -- Relieving Letter
  (1, 'relieving_letter', 'YES', 'yes', 1, TRUE, FALSE),
  (1, 'relieving_letter', 'NO',  'no',  2, TRUE, FALSE),

  -- Experience Letter
  (1, 'experience_letter', 'YES', 'yes', 1, TRUE, FALSE),
  (1, 'experience_letter', 'NO',  'no',  2, TRUE, FALSE);


-- ============================================================
-- DB FUNCTIONS
-- ============================================================

-- ------------------------------------------------------------
-- fn_get_hr_questions
--    Returns all active questions for a company with their
--    group info and options aggregated per question.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_hr_questions(
  p_company_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'question_id',   q.question_id,
          'question_key',  q.question_key,
          'question_text', q.question_text,
          'input_type',    q.input_type,
          'is_required',   q.is_required,
          'display_order', q.display_order,
          'group', CASE
            WHEN g.group_id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'group_id',   g.group_id,
              'group_name', g.group_name
            )
          END,
          'options', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'option_id',    o.option_id,
                  'option_label', o.option_label,
                  'option_value', o.option_value
                )
                ORDER BY o.display_order
              )
              FROM mechsoft.tbl_hr_question_options o
              WHERE o.question_key = q.question_key
                AND o.company_id   = p_company_id
                AND o.is_active    = TRUE
                AND o.is_deleted   = FALSE
            ),
            '[]'::JSONB
          )
        )
        ORDER BY q.display_order
      )
      FROM mechsoft.tbl_hr_questions q
      LEFT JOIN mechsoft.tbl_hr_question_groups g
        ON g.group_id   = q.group_id
       AND g.company_id = p_company_id
       AND g.is_active  = TRUE
       AND g.is_deleted = FALSE
      WHERE q.company_id = p_company_id
        AND q.is_active  = TRUE
        AND q.is_deleted = FALSE
    ),
    '[]'::JSONB
  );
END;
$$;


-- ------------------------------------------------------------
-- fn_save_hr_answers
--    Upserts answers for a candidate.
--    For each item: delete existing row for that
--    (candidate_id + question_key), then insert fresh.
--    Partial save is allowed — only passed keys are touched.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_save_hr_answers(
  p_candidate_id BIGINT,
  p_answers      JSONB,
  p_created_by   INT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_item JSONB;
BEGIN
  FOR v_item IN SELECT jsonb_array_elements(p_answers)
  LOOP
    -- Remove existing answer for this candidate + question
    DELETE FROM mechsoft.tbl_candidate_hr_answers
    WHERE candidate_id = p_candidate_id
      AND question_key = v_item->>'question_key';

    -- Insert fresh answer
    INSERT INTO mechsoft.tbl_candidate_hr_answers (
      candidate_id,
      question_key,
      answer_text,
      created_by,
      created_date,
      modified_by,
      modified_date
    )
    VALUES (
      p_candidate_id,
      v_item->>'question_key',
      v_item->>'answer_text',
      p_created_by,
      NOW(),
      NULL,
      NULL
    );
  END LOOP;
END;
$$;


-- ------------------------------------------------------------
-- fn_get_hr_answers
--    Returns all active questions for the company with the
--    candidate's saved answer merged in.
--    answer_text = NULL means question not yet answered.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mechsoft.fn_get_hr_answers(
  p_candidate_id BIGINT,
  p_company_id   BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'question_id',   q.question_id,
          'question_key',  q.question_key,
          'question_text', q.question_text,
          'input_type',    q.input_type,
          'is_required',   q.is_required,
          'display_order', q.display_order,
          'group', CASE
            WHEN g.group_id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'group_id',   g.group_id,
              'group_name', g.group_name
            )
          END,
          'options', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'option_id',    o.option_id,
                  'option_label', o.option_label,
                  'option_value', o.option_value
                )
                ORDER BY o.display_order
              )
              FROM mechsoft.tbl_hr_question_options o
              WHERE o.question_key = q.question_key
                AND o.company_id   = p_company_id
                AND o.is_active    = TRUE
                AND o.is_deleted   = FALSE
            ),
            '[]'::JSONB
          ),
          'answer_text', a.answer_text
        )
        ORDER BY q.display_order
      )
      FROM mechsoft.tbl_hr_questions q
      LEFT JOIN mechsoft.tbl_hr_question_groups g
        ON g.group_id   = q.group_id
       AND g.company_id = p_company_id
       AND g.is_active  = TRUE
       AND g.is_deleted = FALSE
      LEFT JOIN mechsoft.tbl_candidate_hr_answers a
        ON a.question_key  = q.question_key
       AND a.candidate_id  = p_candidate_id
      WHERE q.company_id = p_company_id
        AND q.is_active  = TRUE
        AND q.is_deleted = FALSE
    ),
    '[]'::JSONB
  );
END;
$$;
