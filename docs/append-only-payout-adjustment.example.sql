-- Append-only payout adjustment example
--
-- Scenario:
--   Distributor: Cabinet Line (id 3)
--   Sub-invoice: 4201
--   Original internal net payable: $2,870.50 / 287050 cents
--   Provider transfer actually sent: $2,850.50 / 285050 cents
--   Mismatch: internal ledger is overstated by $20.00 / -2000 cents
--
-- This script is illustrative and MUST NOT be run unchanged against production.
-- It assumes:
--   - all money is represented in integer cents;
--   - the original payout ledger row is immutable;
--   - reconciliation cases and adjustment rows are append-only;
--   - a finance/admin user approved the correction;
--   - the provider transfer has already been independently verified.

START TRANSACTION;

-- 1. Lock and inspect the original payout ledger entry.
-- Never UPDATE the original amount, provider reference, or historical status.
SELECT
  id,
  sub_invoice_id,
  distributor_id,
  payment_id,
  allocation_id,
  entry_type,
  gross_amount_cents,
  tax_collected_cents,
  retained_fee_cents,
  net_payable_cents,
  provider_transfer_id,
  status,
  created_at
FROM distributor_payout_ledger
WHERE id = 55001
  AND sub_invoice_id = 4201
  AND distributor_id = 3
FOR UPDATE;

-- Application must verify before continuing:
--   1. provider transfer settled at exactly 285050 cents;
--   2. currency is USD;
--   3. transfer belongs to distributor 3;
--   4. transfer belongs to sub-invoice 4201;
--   5. no prior adjustment already resolves this case.

-- 2. Create an audited reconciliation case.
-- This is a new case record; it does not alter the original payout.
-- The proposed schema should include 'payout_mismatch' in its issue_type enum.
INSERT INTO ledger_reconciliation_cases (
  case_number,
  order_request_id,
  sub_invoice_id,
  payment_id,
  severity,
  issue_type,
  status,
  provider_evidence_hash,
  internal_evidence_hash,
  root_cause,
  opened_by
)
VALUES (
  'REC-2026-0042',
  1042,
  4201,
  9001,
  'sev1',
  'payout_mismatch',
  'awaiting_approval',
  'sha256:provider-export-verified-0042',
  'sha256:internal-ledger-snapshot-0042',
  'Provider settlement is 2000 cents lower than the original internal payout ledger entry.',
  7
);

SET @case_id = LAST_INSERT_ID();

-- 3. Record the proposed correction as an append-only adjustment.
-- The original payout row remains untouched.
INSERT INTO ledger_reconciliation_adjustments (
  case_id,
  adjustment_type,
  target_table,
  target_id,
  amount_delta_cents,
  before_json,
  after_json,
  reason,
  approved_by,
  executed_by
)
VALUES (
  @case_id,
  'payout',
  'distributor_payout_ledger',
  55001,
  -2000,
  JSON_OBJECT(
    'netPayableCents', 287050,
    'providerTransferId', 'tr_provider_abc123',
    'status', 'paid'
  ),
  JSON_OBJECT(
    'correctedNetPayableCents', 285050,
    'correctionType', 'provider_settlement_reconciliation',
    'adjustmentEntryRequired', TRUE
  ),
  'Verified provider transfer settled at 285050 cents; original ledger overstated payable by 2000 cents.',
  7,
  7
);

SET @adjustment_id = LAST_INSERT_ID();

-- 4. Append a separate correcting payout entry.
-- This separate table/row is the accounting correction. The original payout
-- ledger row remains immutable and continues to show 287050 cents.
INSERT INTO distributor_payout_ledger_adjustments (
  original_payout_ledger_id,
  reconciliation_case_id,
  sub_invoice_id,
  distributor_id,
  payment_id,
  allocation_id,
  adjustment_type,
  amount_delta_cents,
  provider_transfer_id,
  status,
  note,
  created_at
)
VALUES (
  55001,
  @case_id,
  4201,
  3,
  9001,
  7101,
  'provider_settlement_correction',
  -2000,
  'tr_provider_abc123',
  'posted',
  'Append-only correction: reduce original payout ledger by 2000 cents to match verified provider settlement.',
  CURRENT_TIMESTAMP
);

SET @correction_id = LAST_INSERT_ID();

-- 5. Link the adjustment record to its correcting entry.
-- These are workflow fields on the adjustment record, not changes to the
-- original payout ledger entry.
UPDATE ledger_reconciliation_adjustments
SET executed_at = CURRENT_TIMESTAMP,
    execution_entry_id = @correction_id
WHERE id = @adjustment_id
  AND case_id = @case_id;

UPDATE ledger_reconciliation_cases
SET status = 'correcting',
    resolution = CONCAT(
      'Posted append-only -2000 cent payout adjustment against original ledger entry 55001. ',
      'Correction entry: ',
      @correction_id
    )
WHERE id = @case_id
  AND status = 'awaiting_approval';

COMMIT;

-- 6. Verify the corrected balance without modifying history.
-- Corrected balance = original payout + all posted adjustments.
SELECT
  p.id AS original_payout_ledger_id,
  p.net_payable_cents AS original_net_payable_cents,
  COALESCE(SUM(a.amount_delta_cents), 0) AS adjustment_delta_cents,
  p.net_payable_cents + COALESCE(SUM(a.amount_delta_cents), 0)
    AS corrected_net_payable_cents,
  p.provider_transfer_id
FROM distributor_payout_ledger p
LEFT JOIN distributor_payout_ledger_adjustments a
  ON a.original_payout_ledger_id = p.id
 AND a.status = 'posted'
WHERE p.id = 55001
GROUP BY p.id, p.net_payable_cents, p.provider_transfer_id;

-- Expected:
-- original_net_payable_cents = 287050
-- adjustment_delta_cents     = -2000
-- corrected_net_payable_cents = 285050

-- 7. Verify the immutable original and the separate correction.
SELECT
  'original' AS row_kind,
  id,
  net_payable_cents,
  provider_transfer_id,
  status
FROM distributor_payout_ledger
WHERE id = 55001
UNION ALL
SELECT
  'adjustment' AS row_kind,
  id,
  amount_delta_cents,
  provider_transfer_id,
  status
FROM distributor_payout_ledger_adjustments
WHERE id = @correction_id;

-- Expected:
-- row_kind   id       amount           provider_transfer_id  status
-- original   55001    287050           tr_provider_abc123    paid
-- adjustment new      -2000            tr_provider_abc123    posted

-- 8. Close the case only after independent provider and ledger verification.
START TRANSACTION;

SELECT
  lrc.id,
  lrc.case_number,
  lrc.status,
  lra.amount_delta_cents,
  lra.execution_entry_id
FROM ledger_reconciliation_cases lrc
JOIN ledger_reconciliation_adjustments lra ON lra.case_id = lrc.id
WHERE lrc.id = @case_id
FOR UPDATE;

-- Finance/admin must verify:
--   corrected internal ledger = provider settlement;
--   no duplicate payout transfer exists;
--   distributor statement reflects 285050 cents;
--   no affiliate commission was incorrectly changed by this payout-only correction.

UPDATE ledger_reconciliation_cases
SET status = 'verified',
    resolution = CONCAT(
      'Verified corrected payout total is 285050 cents against provider transfer tr_provider_abc123. ',
      'Original entry 55001 preserved; append-only correction entry ',
      @correction_id,
      ' posted.'
    ),
    resolved_by = 7,
    resolved_at = CURRENT_TIMESTAMP
WHERE id = @case_id
  AND status = 'correcting';

COMMIT;

-- 9. Final audit view.
SELECT
  lrc.case_number,
  lrc.status AS case_status,
  lrc.issue_type,
  lrc.approved_by,
  lrc.resolved_by,
  lra.id AS adjustment_id,
  lra.amount_delta_cents,
  lra.execution_entry_id,
  lrc.resolved_at
FROM ledger_reconciliation_cases lrc
JOIN ledger_reconciliation_adjustments lra ON lra.case_id = lrc.id
WHERE lrc.case_number = 'REC-2026-0042';

-- Required supporting constraints/tables (illustrative):
--
-- CREATE TABLE distributor_payout_ledger_adjustments (
--   id BIGINT PRIMARY KEY AUTO_INCREMENT,
--   original_payout_ledger_id BIGINT NOT NULL,
--   reconciliation_case_id BIGINT NOT NULL,
--   sub_invoice_id BIGINT NOT NULL,
--   distributor_id BIGINT NOT NULL,
--   payment_id BIGINT NULL,
--   allocation_id BIGINT NULL,
--   adjustment_type VARCHAR(64) NOT NULL,
--   amount_delta_cents BIGINT NOT NULL,
--   provider_transfer_id VARCHAR(255) NULL,
--   status ENUM('pending','posted','voided') NOT NULL DEFAULT 'pending',
--   note TEXT NOT NULL,
--   created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   UNIQUE KEY payout_case_once (reconciliation_case_id, original_payout_ledger_id),
--   FOREIGN KEY (original_payout_ledger_id) REFERENCES distributor_payout_ledger(id),
--   FOREIGN KEY (reconciliation_case_id) REFERENCES ledger_reconciliation_cases(id)
-- );
--
-- Add workflow linkage columns to ledger_reconciliation_adjustments:
-- ALTER TABLE ledger_reconciliation_adjustments
--   ADD COLUMN executed_at TIMESTAMP NULL,
--   ADD COLUMN execution_entry_id BIGINT NULL;
--
-- Add 'payout_mismatch' to the reconciliation issue type enum if it is not
-- already present in the deployed schema.

-- Safety notes:
-- 1. Do not UPDATE distributor_payout_ledger.net_payable_cents on row 55001.
-- 2. Do not create a second provider transfer to "balance" the ledger unless
--    finance explicitly approves a new transfer and records it separately.
-- 3. Do not change the customer invoice or affiliate commission unless the
--    evidence shows the underlying sale or commission base was also wrong.
-- 4. If the provider transfer is uncertain because of a timeout, query the
--    provider by idempotency key/reference before posting any correction.
-- 5. Use a unique constraint such as (reconciliation_case_id,
--    original_payout_ledger_id) to prevent duplicate adjustments.
