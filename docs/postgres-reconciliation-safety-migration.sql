-- PostgreSQL reference migration: read-only reconciliation safety controls
--
-- IMPORTANT:
--   1. This script is illustrative and MUST NOT be run unchanged in production.
--   2. The current CabinetDealz project has a MySQL-oriented schema; this file is
--      a PostgreSQL reference for a future PostgreSQL deployment.
--   3. Run through a reviewed migration process using a non-superuser migration
--      owner. Do not put passwords in this file.
--   4. Replace owner names, schemas, and existing-table definitions after an
--      actual PostgreSQL schema audit.
--   5. Historical ledger rows are intentionally immutable. Corrections use a
--      separate append-only adjustment table.
--
-- Expected existing source tables in schema public:
--   order_requests(id)
--   payments(id, order_request_id, transaction_id, status, amount_cents)
--   order_payment_allocations(id, payment_id, sub_invoice_id, allocated_amount_cents)
--   distributor_sub_invoices(id, order_request_id, distributor_id)
--   distributor_payout_ledger(id, sub_invoice_id, distributor_id, payment_id,
--                              allocation_id, net_payable_cents,
--                              provider_transfer_id, status)
--
-- Execute in a controlled maintenance window. The migration is transactional
-- except for role/password operations that your deployment policy may separate.

BEGIN;

-- ================================================================
-- 1. Dedicated schemas
-- ================================================================

CREATE SCHEMA IF NOT EXISTS reconciliation;

COMMENT ON SCHEMA reconciliation IS
  'Read-only Stripe reconciliation results, review cases, approvals, audit, and append-only adjustments';

-- Do not allow ordinary public sessions to create objects in this schema.
REVOKE CREATE ON SCHEMA reconciliation FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA reconciliation FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA reconciliation FROM PUBLIC;

-- ================================================================
-- 2. Group roles
-- ================================================================

-- These are NOLOGIN group roles. Bind them to separately managed login roles
-- through your deployment/IAM process. No password is stored here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reconciliation_reader') THEN
    CREATE ROLE reconciliation_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reconciliation_operator') THEN
    CREATE ROLE reconciliation_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_approver') THEN
    CREATE ROLE finance_approver NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_adjuster') THEN
    CREATE ROLE ledger_adjuster NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reconciliation_admin') THEN
    CREATE ROLE reconciliation_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

-- Explicitly keep the roles least-privileged if this migration is rerun.
ALTER ROLE reconciliation_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE reconciliation_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE finance_approver NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE ledger_adjuster NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE reconciliation_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- Role hierarchy: approval and adjustment roles do not inherit each other.
REVOKE reconciliation_reader FROM reconciliation_operator;
REVOKE reconciliation_reader FROM finance_approver;
REVOKE reconciliation_reader FROM ledger_adjuster;
REVOKE reconciliation_reader FROM reconciliation_admin;

-- ================================================================
-- 3. Reconciliation tables
-- ================================================================

CREATE TABLE IF NOT EXISTS reconciliation.runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_key TEXT NOT NULL UNIQUE,
  window_start_utc TIMESTAMPTZ NOT NULL,
  window_end_utc TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','completed','completed_with_mismatches','failed')),
  payout_count INTEGER NOT NULL DEFAULT 0 CHECK (payout_count >= 0),
  mismatch_count INTEGER NOT NULL DEFAULT 0 CHECK (mismatch_count >= 0),
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (window_end_utc > window_start_utc)
);

CREATE TABLE IF NOT EXISTS reconciliation.mismatches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES reconciliation.runs(id),
  stripe_payout_id TEXT,
  order_request_id BIGINT REFERENCES public.order_requests(id),
  sub_invoice_id BIGINT REFERENCES public.distributor_sub_invoices(id),
  payment_id BIGINT REFERENCES public.payments(id),
  severity TEXT NOT NULL CHECK (severity IN ('warning','high','critical')),
  mismatch_type TEXT NOT NULL CHECK (mismatch_type IN (
    'provider_payout_total_mismatch',
    'unmapped_stripe_transaction',
    'internal_payment_missing',
    'provider_payment_missing',
    'allocation_mismatch',
    'refund_mismatch',
    'payout_mismatch',
    'duplicate_provider_reference',
    'currency_mismatch',
    'payout_not_reconciled'
  )),
  provider_amount_cents BIGINT,
  internal_amount_cents BIGINT,
  delta_cents BIGINT,
  currency CHAR(3),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','investigating','awaiting_approval','approved',
    'executing','verification_required','verified','closed',
    'accepted_without_correction','rejected','cancelled'
  )),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution_note TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, stripe_payout_id, payment_id, mismatch_type)
);

CREATE TABLE IF NOT EXISTS reconciliation.payout_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES reconciliation.runs(id),
  stripe_payout_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reconciliation_status TEXT,
  amount_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  arrival_date_utc TIMESTAMPTZ,
  payout_created_at_utc TIMESTAMPTZ,
  balance_transaction_id TEXT,
  destination_id TEXT,
  stripe_payload_hash CHAR(64) NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, stripe_payout_id, stripe_payload_hash)
);

CREATE TABLE IF NOT EXISTS reconciliation.payout_transaction_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payout_snapshot_id BIGINT NOT NULL REFERENCES reconciliation.payout_snapshots(id),
  stripe_balance_transaction_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  source_id TEXT,
  amount_cents BIGINT NOT NULL,
  fee_cents BIGINT NOT NULL DEFAULT 0,
  net_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  available_on_utc TIMESTAMPTZ,
  stripe_payload_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payout_snapshot_id, stripe_balance_transaction_id, stripe_payload_hash)
);

CREATE TABLE IF NOT EXISTS reconciliation.cases (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  mismatch_id BIGINT REFERENCES reconciliation.mismatches(id),
  order_request_id BIGINT REFERENCES public.order_requests(id),
  sub_invoice_id BIGINT REFERENCES public.distributor_sub_invoices(id),
  payment_id BIGINT REFERENCES public.payments(id),
  severity TEXT NOT NULL CHECK (severity IN ('sev1','sev2','sev3')),
  issue_type TEXT NOT NULL CHECK (issue_type IN (
    'payment_missing_internal',
    'payment_missing_provider',
    'allocation_mismatch',
    'duplicate_effect',
    'missing_webhook',
    'missing_fulfillment',
    'missing_commission',
    'refund_mismatch',
    'payout_mismatch',
    'restore_delta'
  )),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','investigating','awaiting_approval','approved','correcting',
    'verification_required','verified','closed','rejected','cancelled'
  )),
  provider_evidence_hash CHAR(64),
  internal_evidence_hash CHAR(64),
  root_cause TEXT,
  resolution TEXT,
  opened_by BIGINT NOT NULL,
  approved_by BIGINT,
  resolved_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reconciliation.override_approvals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES reconciliation.cases(id),
  approval_type TEXT NOT NULL CHECK (approval_type IN ('financial','operational','emergency')),
  requested_by BIGINT NOT NULL,
  approved_by BIGINT,
  requested_amount_delta_cents BIGINT,
  requested_target_table TEXT,
  requested_target_id BIGINT,
  requested_before_hash CHAR(64),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested','approved','rejected','expired','withdrawn'
  )),
  request_note TEXT NOT NULL,
  decision_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

CREATE TABLE IF NOT EXISTS reconciliation.ledger_adjustments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES reconciliation.cases(id),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN (
    'payment','allocation','refund','payout','commission','fulfillment_status'
  )),
  target_table TEXT NOT NULL,
  target_id BIGINT NOT NULL,
  amount_delta_cents BIGINT,
  before_state JSONB NOT NULL,
  after_state JSONB NOT NULL,
  reason TEXT NOT NULL,
  approved_by BIGINT NOT NULL,
  executed_by BIGINT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  execution_entry_id BIGINT,
  UNIQUE (case_id, target_table, target_id)
);

-- Separate append-only payout correction rows. The original payout ledger is
-- never updated by this workflow.
CREATE TABLE IF NOT EXISTS reconciliation.payout_ledger_adjustments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  original_payout_ledger_id BIGINT NOT NULL REFERENCES public.distributor_payout_ledger(id),
  case_id BIGINT NOT NULL REFERENCES reconciliation.cases(id),
  sub_invoice_id BIGINT NOT NULL REFERENCES public.distributor_sub_invoices(id),
  distributor_id BIGINT NOT NULL,
  payment_id BIGINT REFERENCES public.payments(id),
  allocation_id BIGINT REFERENCES public.order_payment_allocations(id),
  adjustment_type TEXT NOT NULL,
  amount_delta_cents BIGINT NOT NULL CHECK (amount_delta_cents <> 0),
  provider_transfer_id TEXT,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','voided')),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, original_payout_ledger_id)
);

CREATE TABLE IF NOT EXISTS reconciliation.override_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id BIGINT REFERENCES reconciliation.cases(id),
  actor_user_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  note TEXT NOT NULL,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 4. Append-only and immutability functions
-- ================================================================

CREATE OR REPLACE FUNCTION reconciliation.reject_historical_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Historical payout ledger rows are immutable; use reconciliation.payout_ledger_adjustments';
END;
$$;

DROP TRIGGER IF EXISTS payout_ledger_immutable_update ON public.distributor_payout_ledger;
CREATE TRIGGER payout_ledger_immutable_update
BEFORE UPDATE ON public.distributor_payout_ledger
FOR EACH ROW
EXECUTE FUNCTION reconciliation.reject_historical_ledger_mutation();

DROP TRIGGER IF EXISTS payout_ledger_immutable_delete ON public.distributor_payout_ledger;
CREATE TRIGGER payout_ledger_immutable_delete
BEFORE DELETE ON public.distributor_payout_ledger
FOR EACH ROW
EXECUTE FUNCTION reconciliation.reject_historical_ledger_mutation();

CREATE OR REPLACE FUNCTION reconciliation.reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Append-only reconciliation rows cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS payout_adjustment_append_only_update
  ON reconciliation.payout_ledger_adjustments;
CREATE TRIGGER payout_adjustment_append_only_update
BEFORE UPDATE ON reconciliation.payout_ledger_adjustments
FOR EACH ROW
EXECUTE FUNCTION reconciliation.reject_append_only_mutation();

DROP TRIGGER IF EXISTS payout_adjustment_append_only_delete
  ON reconciliation.payout_ledger_adjustments;
CREATE TRIGGER payout_adjustment_append_only_delete
BEFORE DELETE ON reconciliation.payout_ledger_adjustments
FOR EACH ROW
EXECUTE FUNCTION reconciliation.reject_append_only_mutation();

DROP TRIGGER IF EXISTS ledger_adjustment_append_only_update
  ON reconciliation.ledger_adjustments;
CREATE TRIGGER ledger_adjustment_append_only_update
BEFORE UPDATE ON reconciliation.ledger_adjustments
FOR EACH ROW
EXECUTE FUNCTION reconciliation.reject_append_only_mutation();

DROP TRIGGER IF EXISTS ledger_adjustment_append_only_delete
  ON reconciliation.ledger_adjustments;
CREATE TRIGGER ledger_adjustment_append_only_delete
BEFORE DELETE ON reconciliation.ledger_adjustments
FOR EACH ROW
EXECUTE FUNCTION reconciliation.reject_append_only_mutation();

DROP TRIGGER IF EXISTS override_audit_append_only_update
  ON reconciliation.override_audit;
CREATE TRIGGER override_audit_append_only_update
BEFORE UPDATE ON reconciliation.override_audit
FOR EACH ROW
EXECUTE FUNCTION reconciliation.reject_append_only_mutation();

DROP TRIGGER IF EXISTS override_audit_append_only_delete
  ON reconciliation.override_audit;
CREATE TRIGGER override_audit_append_only_delete
BEFORE DELETE ON reconciliation.override_audit
FOR EACH ROW
EXECUTE FUNCTION reconciliation.reject_append_only_mutation();

-- ================================================================
-- 5. Useful read-only views
-- ================================================================

CREATE OR REPLACE VIEW reconciliation.payout_corrected_balances
WITH (security_barrier = true)
AS
SELECT
  p.id AS original_payout_ledger_id,
  p.sub_invoice_id,
  p.distributor_id,
  p.net_payable_cents AS original_net_payable_cents,
  COALESCE(SUM(a.amount_delta_cents) FILTER (WHERE a.status = 'posted'), 0)
    AS posted_adjustment_delta_cents,
  p.net_payable_cents
    + COALESCE(SUM(a.amount_delta_cents) FILTER (WHERE a.status = 'posted'), 0)
    AS corrected_net_payable_cents,
  p.provider_transfer_id
FROM public.distributor_payout_ledger p
LEFT JOIN reconciliation.payout_ledger_adjustments a
  ON a.original_payout_ledger_id = p.id
GROUP BY p.id, p.sub_invoice_id, p.distributor_id,
         p.net_payable_cents, p.provider_transfer_id;

CREATE OR REPLACE VIEW reconciliation.open_mismatch_summary
WITH (security_barrier = true)
AS
SELECT
  m.id,
  m.severity,
  m.mismatch_type,
  m.status,
  m.stripe_payout_id,
  m.payment_id,
  m.sub_invoice_id,
  m.provider_amount_cents,
  m.internal_amount_cents,
  m.delta_cents,
  m.currency,
  m.opened_at
FROM reconciliation.mismatches m
WHERE m.status NOT IN ('verified','closed','accepted_without_correction','rejected','cancelled');

-- ================================================================
-- 6. Least-privilege grants
-- ================================================================

-- Schema access.
GRANT USAGE ON SCHEMA public TO reconciliation_reader, reconciliation_operator,
  finance_approver, ledger_adjuster, reconciliation_admin;
GRANT USAGE ON SCHEMA reconciliation TO reconciliation_reader, reconciliation_operator,
  finance_approver, ledger_adjuster, reconciliation_admin;

-- Remove any accidental broad privileges from the reconciliation roles.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM reconciliation_reader,
  reconciliation_operator, finance_approver, ledger_adjuster, reconciliation_admin;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA reconciliation FROM reconciliation_reader,
  reconciliation_operator, finance_approver, ledger_adjuster, reconciliation_admin;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA reconciliation FROM reconciliation_reader,
  reconciliation_operator, finance_approver, ledger_adjuster, reconciliation_admin;

-- Automated reader: read source tables; write only snapshots, run state, and
-- mismatch flags. It cannot touch payments, invoices, refunds, commissions,
-- payouts, fulfillment, cases, approvals, or adjustments.
GRANT SELECT ON
  public.order_requests,
  public.payments,
  public.order_payment_allocations,
  public.distributor_sub_invoices,
  public.distributor_payout_ledger
TO reconciliation_reader;

GRANT SELECT, INSERT, UPDATE ON reconciliation.runs TO reconciliation_reader;
GRANT SELECT, INSERT ON reconciliation.mismatches TO reconciliation_reader;
GRANT SELECT, INSERT ON reconciliation.payout_snapshots TO reconciliation_reader;
GRANT SELECT, INSERT ON reconciliation.payout_transaction_snapshots TO reconciliation_reader;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA reconciliation TO reconciliation_reader;

-- Operator: read all reconciliation information and request investigations and
-- approvals, but cannot approve or execute financial corrections.
GRANT SELECT ON ALL TABLES IN SCHEMA reconciliation TO reconciliation_operator;
GRANT SELECT ON
  public.order_requests,
  public.payments,
  public.order_payment_allocations,
  public.distributor_sub_invoices,
  public.distributor_payout_ledger
TO reconciliation_operator;
GRANT INSERT, UPDATE ON reconciliation.cases TO reconciliation_operator;
GRANT INSERT ON reconciliation.override_approvals TO reconciliation_operator;
GRANT INSERT ON reconciliation.override_audit TO reconciliation_operator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA reconciliation TO reconciliation_operator;

-- Finance approver: review cases and approve/reject requests, but cannot post
-- the adjustment and cannot change historical source tables.
GRANT SELECT ON ALL TABLES IN SCHEMA reconciliation TO finance_approver;
GRANT SELECT ON
  public.order_requests,
  public.payments,
  public.order_payment_allocations,
  public.distributor_sub_invoices,
  public.distributor_payout_ledger
TO finance_approver;
GRANT UPDATE (status, approved_by, decision_note, decided_at)
  ON reconciliation.override_approvals TO finance_approver;
GRANT UPDATE (status, approved_by, resolution, resolved_by, resolved_at)
  ON reconciliation.cases TO finance_approver;
GRANT INSERT ON reconciliation.override_audit TO finance_approver;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA reconciliation TO finance_approver;

-- Ledger adjuster: can insert a correction only after the application has
-- verified an approved case. It cannot update/delete the original ledger or
-- update historical records.
GRANT SELECT ON ALL TABLES IN SCHEMA reconciliation TO ledger_adjuster;
GRANT SELECT ON
  public.order_requests,
  public.payments,
  public.order_payment_allocations,
  public.distributor_sub_invoices,
  public.distributor_payout_ledger
TO ledger_adjuster;
GRANT INSERT ON reconciliation.ledger_adjustments TO ledger_adjuster;
GRANT INSERT ON reconciliation.payout_ledger_adjustments TO ledger_adjuster;
GRANT UPDATE (status) ON reconciliation.cases TO ledger_adjuster;
GRANT INSERT ON reconciliation.override_audit TO ledger_adjuster;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA reconciliation TO ledger_adjuster;

-- Reconciliation admin: review and manage the workflow, but still cannot use
-- this role to mutate source financial history. Emergency money movement must
-- use the separate payments-admin workflow.
GRANT SELECT ON ALL TABLES IN SCHEMA reconciliation TO reconciliation_admin;
GRANT SELECT ON
  public.order_requests,
  public.payments,
  public.order_payment_allocations,
  public.distributor_sub_invoices,
  public.distributor_payout_ledger
TO reconciliation_admin;
GRANT INSERT, UPDATE ON reconciliation.cases TO reconciliation_admin;
GRANT INSERT, UPDATE ON reconciliation.override_approvals TO reconciliation_admin;
GRANT INSERT ON reconciliation.override_audit TO reconciliation_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA reconciliation TO reconciliation_admin;

-- No reconciliation role receives source-table INSERT/UPDATE/DELETE.
REVOKE INSERT, UPDATE, DELETE ON
  public.payments,
  public.order_payment_allocations,
  public.distributor_sub_invoices,
  public.distributor_payout_ledger
FROM reconciliation_reader, reconciliation_operator, finance_approver,
  ledger_adjuster, reconciliation_admin;

-- Future tables in the reconciliation schema should not automatically become
-- writable by all application roles. The owner/migration role must review each
-- future grant explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA reconciliation
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA reconciliation
  REVOKE ALL ON SEQUENCES FROM PUBLIC;

-- ================================================================
-- 7. Role-to-login binding examples (commented; do not run blindly)
-- ================================================================

-- Use separate managed login roles for each runtime. Do not share a password.
-- CREATE ROLE cabinetdealz_reconciliation_job LOGIN NOSUPERUSER NOCREATEDB
--   NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- GRANT reconciliation_reader TO cabinetdealz_reconciliation_job;
--
-- CREATE ROLE cabinetdealz_reconciliation_operator LOGIN NOSUPERUSER NOCREATEDB
--   NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- GRANT reconciliation_operator TO cabinetdealz_reconciliation_operator;
--
-- CREATE ROLE cabinetdealz_finance_approver LOGIN NOSUPERUSER NOCREATEDB
--   NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- GRANT finance_approver TO cabinetdealz_finance_approver;
--
-- CREATE ROLE cabinetdealz_ledger_adjuster LOGIN NOSUPERUSER NOCREATEDB
--   NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- GRANT ledger_adjuster TO cabinetdealz_ledger_adjuster;

COMMIT;

-- ================================================================
-- 8. Post-migration verification queries
-- ================================================================

-- Role attributes.
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
       rolbypassrls, rolcanlogin
FROM pg_roles
WHERE rolname IN (
  'reconciliation_reader',
  'reconciliation_operator',
  'finance_approver',
  'ledger_adjuster',
  'reconciliation_admin'
)
ORDER BY rolname;

-- Confirm the reader has no source-table write privileges.
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'reconciliation_reader'
  AND table_schema = 'public'
  AND privilege_type IN ('INSERT','UPDATE','DELETE')
ORDER BY table_name, privilege_type;
-- Expected: zero rows.

-- Confirm immutable trigger exists.
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname IN (
  'payout_ledger_immutable_update',
  'payout_ledger_immutable_delete'
);

-- Confirm no duplicate posted adjustment for one original payout/case.
SELECT case_id, original_payout_ledger_id, COUNT(*)
FROM reconciliation.payout_ledger_adjustments
WHERE status = 'posted'
GROUP BY case_id, original_payout_ledger_id
HAVING COUNT(*) > 1;
-- Expected: zero rows.

-- Expected application-level negative test, executed using the actual reader
-- login in a separate session:
-- UPDATE public.distributor_payout_ledger
-- SET net_payable_cents = net_payable_cents - 1
-- WHERE id = 55001;
-- Expected: permission denied or immutable-trigger exception.

-- Expected application-level positive test for the reader:
-- INSERT INTO reconciliation.mismatches (
--   run_id, severity, mismatch_type, provider_amount_cents,
--   internal_amount_cents, delta_cents, currency
-- ) VALUES (1, 'warning', 'payout_not_reconciled', NULL, NULL, NULL, 'usd');
-- Expected: permitted when run_id exists.

-- Operational note:
-- PostgreSQL table owners and superusers can bypass ordinary grants. The owner
-- of public.distributor_payout_ledger must be a non-login migration/owner role,
-- not the reconciliation job login. Do not grant BYPASSRLS or SUPERUSER to any
-- reconciliation runtime role.
