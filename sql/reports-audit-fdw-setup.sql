-- ============================================================
-- AI Usage report — one-time setup of the read-only link
-- from Resume_Tracker (HR DB) to aesservice (LLM audit DB).
--
-- Run as a superuser (postgres) from pgAdmin, in this order:
--   PART 1 → connected to database  aesservice
--   PART 2 → connected to database  Resume_Tracker
--
-- Replace before running:
--   <hr_audit_reader_password>  password you choose for hr_audit_reader
--                               (same value in step 1.2 and step 2.3)
-- Never commit real passwords to this file.
-- ============================================================


-- ============================================================
-- PART 1 — run in database: aesservice
-- ============================================================

-- 1.1  HR-only view: other projects' rows are never visible
CREATE OR REPLACE VIEW public.v_hr_tracker_audit AS
SELECT id, module, feature, organization_id, status,
       prompt_tokens, completion_tokens, total_tokens, total_cost,
       metadata, created_at
FROM public.audit_records
WHERE application_name = 'hr_tracker';

-- 1.2  Read-only login that can see only that view
CREATE ROLE hr_audit_reader LOGIN PASSWORD 'M3ch50ft@123';
GRANT CONNECT ON DATABASE aesservice TO hr_audit_reader;
GRANT USAGE  ON SCHEMA public TO hr_audit_reader;
GRANT SELECT ON public.v_hr_tracker_audit TO hr_audit_reader;

-- 1.3  Indexes for the report filters.
--      CONCURRENTLY = no write lock for other projects.
--      Run EACH statement on its own (not inside a transaction / batch).
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_audit_app_org_created
  ON public.audit_records (application_name, organization_id, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_audit_hr_candidate
  ON public.audit_records ((metadata->>'candidate_id'))
  WHERE application_name = 'hr_tracker';

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_audit_hr_jd
  ON public.audit_records ((metadata->>'jd_id'))
  WHERE application_name = 'hr_tracker';

-- 1.4  Check: returns the number of HR Tracker audit rows
SELECT count(*) FROM public.v_hr_tracker_audit;


-- ============================================================
-- PART 2 — run in database: Resume_Tracker
-- ============================================================

-- 2.1  Enable the foreign data wrapper (ships with PostgreSQL 16)
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- 2.2  Where the audit DB is (same server → localhost)
CREATE SERVER audit_srv
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host '110.227.214.202', port '5432', dbname 'aesservice', connect_timeout '10');

-- 2.3  Which login the link uses — PUBLIC = every DB login on this server
--      (the API's postgres user, pgAdmin users, any other login).
CREATE USER MAPPING FOR PUBLIC SERVER audit_srv
  OPTIONS (user 'hr_audit_reader', password 'M3ch50ft@123');

-- 2.4  Bring the view in as a foreign table in the existing schema:
--      mechsoft.v_hr_tracker_audit
IMPORT FOREIGN SCHEMA public
  LIMIT TO (v_hr_tracker_audit)
  FROM SERVER audit_srv
  INTO mechsoft;

-- Every login may read the HR-only audit view (read-only, hr_tracker rows only).
-- Logins already have USAGE on mechsoft; only this one table is granted.
GRANT SELECT ON mechsoft.v_hr_tracker_audit TO PUBLIC;

-- 2.5  Check: must return the same number as step 1.4
SELECT count(*) FROM mechsoft.v_hr_tracker_audit;


-- ============================================================
-- PART 3 — one environment's data only (audit_records.credential_id)
--   Local and production share aesservice, so each environment reads
--   its own view:  credential_id 12 = local, 14 = production.
--   Existing login, server, user mapping, grants and report functions
--   stay as they are — only the foreign table's source view changes.
-- ============================================================

-- 3.1  run in database: aesservice (once, for both environments)
CREATE OR REPLACE VIEW public.v_hr_tracker_audit_local AS
SELECT id, module, feature, organization_id, status,
       prompt_tokens, completion_tokens, total_tokens, total_cost,
       metadata, created_at
FROM public.audit_records
WHERE application_name = 'hr_tracker'
  AND credential_id = 12;   -- local

CREATE OR REPLACE VIEW public.v_hr_tracker_audit_prod AS
SELECT id, module, feature, organization_id, status,
       prompt_tokens, completion_tokens, total_tokens, total_cost,
       metadata, created_at
FROM public.audit_records
WHERE application_name = 'hr_tracker'
  AND credential_id = 14;   -- production

GRANT SELECT ON public.v_hr_tracker_audit_local TO hr_audit_reader;
GRANT SELECT ON public.v_hr_tracker_audit_prod  TO hr_audit_reader;

-- Check: rows per environment
SELECT (SELECT count(*) FROM public.v_hr_tracker_audit_local) AS local_rows,
       (SELECT count(*) FROM public.v_hr_tracker_audit_prod)  AS prod_rows;

-- 3.2  run in database: Resume_Tracker — LOCAL environment
--      (same table name mechsoft.v_hr_tracker_audit; only its source view changes)
ALTER FOREIGN TABLE mechsoft.v_hr_tracker_audit
  OPTIONS (SET table_name 'v_hr_tracker_audit_local');

-- 3.3  run in database: Resume_Tracker — PRODUCTION environment
--      (on a new production setup, run PART 2 first, then this)
ALTER FOREIGN TABLE mechsoft.v_hr_tracker_audit
  OPTIONS (SET table_name 'v_hr_tracker_audit_prod');

-- Check (in each Resume_Tracker): must match that environment's count from 3.1
SELECT count(*) FROM mechsoft.v_hr_tracker_audit;

-- Undo (back to all hr_tracker rows):
--   ALTER FOREIGN TABLE mechsoft.v_hr_tracker_audit OPTIONS (SET table_name 'v_hr_tracker_audit');


-- ============================================================
-- ROLLBACK (only if the link must be removed)
-- ============================================================
-- In Resume_Tracker:
--   DROP SERVER audit_srv CASCADE;   -- also drops mechsoft.v_hr_tracker_audit and the user mapping
-- In aesservice:
--   DROP VIEW public.v_hr_tracker_audit;
--   DROP ROLE hr_audit_reader;
