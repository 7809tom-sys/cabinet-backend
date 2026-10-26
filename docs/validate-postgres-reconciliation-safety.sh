#!/usr/bin/env bash
# Validate PostgreSQL reconciliation safety controls without committing data.
#
# This script is STAGING-ONLY. It opens one transaction and rolls it back.
# It does not create roles, grant privileges, change triggers, or alter schema.
#
# Required:
#   psql
#   DATABASE_URL or PG* connection environment variables
#   A validation login that is a member of the reconciliation group roles
#
# Optional for live trigger exercise:
#   PAYOUT_LEDGER_FIXTURE_ID  Existing disposable payout-ledger row ID
#   LEDGER_OWNER_ROLE         Owner/migration role that owns the source table
#
# Example:
#   chmod +x docs/validate-postgres-reconciliation-safety.sh
#   DATABASE_URL='postgresql://validator@staging/cabinet_dealz' \
#   PAYOUT_LEDGER_FIXTURE_ID=900001 \
#   LEDGER_OWNER_ROLE=cabinetdealz_migration_owner \
#   ./docs/validate-postgres-reconciliation-safety.sh
#
# Do not point this at production. Use a restored staging clone or disposable
# database with synthetic fixture data.

set -Eeuo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a staging PostgreSQL database}"

if [[ "${ALLOW_STAGING_DRY_RUN:-}" != "yes" ]]; then
  echo "Refusing to run without ALLOW_STAGING_DRY_RUN=yes" >&2
  exit 2
fi

if [[ "${ENVIRONMENT:-staging}" == "production" ]]; then
  echo "Refusing to run with ENVIRONMENT=production" >&2
  exit 2
fi

PSQL=(psql "$DATABASE_URL" --no-psqlrc --quiet --set=ON_ERROR_STOP=1)

"${PSQL[@]}" <<'SQL'
\set VERBOSITY terse
\echo 'PostgreSQL reconciliation safety dry-run: START'

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- Helper: abort the validation transaction with a clear message.
CREATE OR REPLACE FUNCTION pg_temp.assert_true(condition boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT condition THEN
    RAISE EXCEPTION 'VALIDATION FAILED: %', message;
  END IF;
END;
$$;

SELECT assert_true(current_database() <> '', 'database connection is missing');
SELECT assert_true(current_user <> 'postgres', 'use a dedicated validation login, not the postgres superuser');

-- ================================================================
-- 1. Role existence and dangerous-role checks
-- ================================================================

SELECT assert_true(EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reconciliation_reader'),
  'reconciliation_reader role is missing');
SELECT assert_true(EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reconciliation_operator'),
  'reconciliation_operator role is missing');
SELECT assert_true(EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_approver'),
  'finance_approver role is missing');
SELECT assert_true(EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_adjuster'),
  'ledger_adjuster role is missing');

SELECT assert_true(NOT EXISTS (
  SELECT 1 FROM pg_roles
  WHERE rolname IN (
    'reconciliation_reader','reconciliation_operator','finance_approver',
    'ledger_adjuster','reconciliation_admin'
  )
  AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
), 'a reconciliation role has dangerous superuser/database/replication/RLS-bypass attributes');

-- ================================================================
-- 2. Required table, trigger, and constraint inventory
-- ================================================================

SELECT assert_true(to_regclass('reconciliation.runs') IS NOT NULL,
  'reconciliation.runs is missing');
SELECT assert_true(to_regclass('reconciliation.mismatches') IS NOT NULL,
  'reconciliation.mismatches is missing');
SELECT assert_true(to_regclass('reconciliation.cases') IS NOT NULL,
  'reconciliation.cases is missing');
SELECT assert_true(to_regclass('reconciliation.payout_ledger_adjustments') IS NOT NULL,
  'append-only payout adjustment table is missing');

SELECT assert_true(EXISTS (
  SELECT 1 FROM pg_trigger
  WHERE tgrelid = 'public.distributor_payout_ledger'::regclass
    AND tgname = 'payout_ledger_immutable_update'
    AND NOT tgisinternal
), 'payout ledger immutable update trigger is missing');

SELECT assert_true(EXISTS (
  SELECT 1 FROM pg_trigger
  WHERE tgrelid = 'public.distributor_payout_ledger'::regclass
    AND tgname = 'payout_ledger_immutable_delete'
    AND NOT tgisinternal
), 'payout ledger immutable delete trigger is missing');

SELECT assert_true(EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'reconciliation'
    AND t.relname = 'payout_ledger_adjustments'
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) LIKE '%case_id%original_payout_ledger_id%'
), 'duplicate payout-adjustment uniqueness constraint is missing');

-- ================================================================
-- 3. Static privilege assertions
-- ================================================================

SELECT assert_true(has_table_privilege(
  'reconciliation_reader', 'public.payments', 'SELECT'
), 'reader lacks SELECT on public.payments');
SELECT assert_true(has_table_privilege(
  'reconciliation_reader', 'public.distributor_payout_ledger', 'SELECT'
), 'reader lacks SELECT on payout ledger');
SELECT assert_true(has_table_privilege(
  'reconciliation_reader', 'reconciliation.runs', 'INSERT'
), 'reader lacks INSERT on reconciliation.runs');
SELECT assert_true(has_table_privilege(
  'reconciliation_reader', 'reconciliation.mismatches', 'INSERT'
), 'reader lacks INSERT on reconciliation.mismatches');

SELECT assert_true(NOT has_table_privilege(
  'reconciliation_reader', 'public.payments', 'UPDATE'
), 'reader can UPDATE payments');
SELECT assert_true(NOT has_table_privilege(
  'reconciliation_reader', 'public.payments', 'DELETE'
), 'reader can DELETE payments');
SELECT assert_true(NOT has_table_privilege(
  'reconciliation_reader', 'public.distributor_payout_ledger', 'UPDATE'
), 'reader can UPDATE payout ledger');
SELECT assert_true(NOT has_table_privilege(
  'reconciliation_reader', 'public.distributor_payout_ledger', 'DELETE'
), 'reader can DELETE payout ledger');
SELECT assert_true(NOT has_table_privilege(
  'reconciliation_reader', 'reconciliation.payout_ledger_adjustments', 'INSERT'
), 'reader can INSERT payout adjustments');

SELECT assert_true(NOT has_table_privilege(
  'finance_approver', 'public.distributor_payout_ledger', 'UPDATE'
), 'finance approver can UPDATE historical payout ledger');
SELECT assert_true(NOT has_table_privilege(
  'ledger_adjuster', 'public.distributor_payout_ledger', 'UPDATE'
), 'ledger adjuster can UPDATE historical payout ledger');
SELECT assert_true(has_table_privilege(
  'ledger_adjuster', 'reconciliation.payout_ledger_adjustments', 'INSERT'
), 'ledger adjuster lacks INSERT on append-only adjustment table');

-- ================================================================
-- 4. Runtime test: reader can write flags but cannot write source ledgers
-- ================================================================

SET LOCAL ROLE reconciliation_reader;

WITH new_run AS (
  INSERT INTO reconciliation.runs (
    run_key, window_start_utc, window_end_utc, status
  ) VALUES (
    'dry-run-validation:' || txid_current(),
    now() - interval '1 day',
    now(),
    'running'
  )
  RETURNING id
)
SELECT id AS validation_run_id FROM new_run \gset

INSERT INTO reconciliation.mismatches (
  run_id,
  severity,
  mismatch_type,
  provider_amount_cents,
  internal_amount_cents,
  delta_cents,
  currency,
  evidence
) VALUES (
  :'validation_run_id',
  'warning',
  'payout_not_reconciled',
  NULL,
  NULL,
  NULL,
  'usd',
  jsonb_build_object('dryRun', true)
);

DO $$
BEGIN
  BEGIN
    UPDATE public.payments
    SET status = status
    WHERE false;
    RAISE EXCEPTION 'VALIDATION FAILED: reader UPDATE on payments unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: reader UPDATE on payments denied';
  END;

  BEGIN
    DELETE FROM public.distributor_payout_ledger
    WHERE false;
    RAISE EXCEPTION 'VALIDATION FAILED: reader DELETE on payout ledger unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: reader DELETE on payout ledger denied';
  END;
END
$$;

RESET ROLE;

-- ================================================================
-- 5. Runtime test: operator can open a case but cannot approve/execute
-- ================================================================

SET LOCAL ROLE reconciliation_operator;

WITH new_case AS (
  INSERT INTO reconciliation.cases (
    case_number,
    severity,
    issue_type,
    status,
    opened_by
  ) VALUES (
    'DRY-RUN-' || txid_current(),
    'sev2',
    'payout_mismatch',
    'open',
    900001
  )
  RETURNING id
)
SELECT id AS validation_case_id FROM new_case \gset

INSERT INTO reconciliation.override_approvals (
  case_id,
  approval_type,
  requested_by,
  requested_amount_delta_cents,
  requested_target_table,
  requested_target_id,
  status,
  request_note
) VALUES (
  :'validation_case_id',
  'financial',
  900001,
  -2000,
  'public.distributor_payout_ledger',
  1,
  'requested',
  'Dry-run permission validation only.'
);

DO $$
BEGIN
  BEGIN
    UPDATE reconciliation.override_approvals
    SET status = 'approved', approved_by = 900001
    WHERE case_id = :'validation_case_id'::bigint;
    RAISE EXCEPTION 'VALIDATION FAILED: operator unexpectedly approved a request';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: operator approval update denied';
  END;
END
$$;

RESET ROLE;

-- ================================================================
-- 6. Four-eyes constraint test
-- ================================================================

DO $$
DECLARE
  case_id bigint;
  approval_id bigint;
BEGIN
  SELECT :'validation_case_id'::bigint INTO case_id;
  SELECT oa.id INTO approval_id
  FROM reconciliation.override_approvals AS oa
  WHERE oa.case_id = case_id
  ORDER BY oa.id DESC
  LIMIT 1;

  BEGIN
    UPDATE reconciliation.override_approvals
    SET approved_by = requested_by, status = 'approved'
    WHERE id = approval_id;
    RAISE EXCEPTION 'VALIDATION FAILED: requester was allowed to approve own request';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: four-eyes approval constraint rejected self-approval';
  END;
END
$$;

-- ================================================================
-- 7. Trigger invariant test
-- ================================================================

-- The trigger must be exercised by the table owner/migration role because the
-- reconciliation roles should be denied the UPDATE/DELETE privilege before
-- the trigger can run. Supply a disposable fixture row to test the trigger.
\if :{?PAYOUT_LEDGER_FIXTURE_ID}
  \if :{?LEDGER_OWNER_ROLE}
    SET LOCAL ROLE :"LEDGER_OWNER_ROLE";

    DO $$
    BEGIN
      BEGIN
        UPDATE public.distributor_payout_ledger
        SET net_payable_cents = net_payable_cents
        WHERE id = :'PAYOUT_LEDGER_FIXTURE_ID'::bigint;
        RAISE EXCEPTION 'VALIDATION FAILED: payout ledger immutable UPDATE trigger did not fire';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE '%Historical payout ledger rows are immutable%' THEN
          RAISE;
        END IF;
        RAISE NOTICE 'PASS: payout ledger UPDATE trigger rejected mutation';
      END;

      BEGIN
        DELETE FROM public.distributor_payout_ledger
        WHERE id = :'PAYOUT_LEDGER_FIXTURE_ID'::bigint;
        RAISE EXCEPTION 'VALIDATION FAILED: payout ledger immutable DELETE trigger did not fire';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE '%Historical payout ledger rows are immutable%' THEN
          RAISE;
        END IF;
        RAISE NOTICE 'PASS: payout ledger DELETE trigger rejected mutation';
      END;
    END
    $$;

    RESET ROLE;
  \else
    \echo 'WARN: LEDGER_OWNER_ROLE not supplied; catalog trigger check ran, live trigger exercise skipped'
  \endif
\else
  \echo 'WARN: PAYOUT_LEDGER_FIXTURE_ID not supplied; live trigger exercise skipped'
\endif

-- ================================================================
-- 8. Verify no production data was changed
-- ================================================================

-- All inserts above are inside the outer transaction and will be rolled back.
SELECT assert_true(
  (SELECT COUNT(*) FROM reconciliation.mismatches WHERE evidence->>'dryRun' = 'true') >= 1,
  'dry-run mismatch insert was not observable inside transaction'
);

ROLLBACK;
\echo 'PostgreSQL reconciliation safety dry-run: PASS (all test writes rolled back)'
SQL

# psql exits nonzero on any assertion, permission, trigger, or SQL failure.
echo "Validation completed successfully; no test data was committed."
