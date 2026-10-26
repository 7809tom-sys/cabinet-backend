# Read-Only Reconciliation Controls and Manual Override Workflow

## Purpose

The daily Stripe reconciliation job must be able to **read provider and internal ledger data and create mismatch flags**, but it must not automatically:

- Change payment status
- Change invoice totals
- Issue refunds
- Send payouts
- Change commission amounts
- Release fulfillment
- Rewrite historical ledger rows
- Mark a mismatch resolved

Any correction must use a separate, authenticated, audited manual-override workflow.

This is a proposed implementation design. No permissions, endpoints, migrations, or financial workflows have been changed.

## 1. Permission separation

Use separate database credentials and application roles.

| Role | Read provider data | Read internal ledger | Create mismatch flags | Resolve mismatch | Execute adjustment | Issue money |
|---|---:|---:|---:|---:|---:|---:|
| `reconciliation_reader` | Yes | Yes | Yes | No | No | No |
| `reconciliation_operator` | Yes | Yes | Yes | Request only | No | No |
| `finance_approver` | Yes | Yes | Yes | Approve | No | No |
| `ledger_adjuster` | Yes | Yes | Yes | No | Yes, approved cases only | No |
| `payments_admin` | Yes | Yes | Yes | Approve | Yes, separate payment workflow | Yes, separately controlled |
| `incident_admin` | Yes | Yes | Yes | Emergency only | Requires second approval | No unilateral money movement |

The automated daily job should run as `reconciliation_reader`.

## 2. Database-level read-only account

The reconciliation worker should connect to a database user with `SELECT` privileges on financial source tables and `INSERT` privileges only on reconciliation tables.

```sql
CREATE USER 'reconciliation_reader'@'10.%'
  IDENTIFIED BY '<secret-from-secret-manager>';

GRANT SELECT ON cabinet_dealz.order_requests
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT ON cabinet_dealz.payments
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT ON cabinet_dealz.order_payment_allocations
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT ON cabinet_dealz.distributor_sub_invoices
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT ON cabinet_dealz.distributor_sub_invoice_lines
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT ON cabinet_dealz.distributor_refunds
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT ON cabinet_dealz.distributor_refund_allocations
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT ON cabinet_dealz.affiliate_commission_entries
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT ON cabinet_dealz.distributor_payout_ledger
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT ON cabinet_dealz.stripe_payout_snapshots
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT ON cabinet_dealz.stripe_payout_transaction_snapshots
  TO 'reconciliation_reader'@'10.%';

GRANT SELECT, INSERT, UPDATE ON cabinet_dealz.stripe_reconciliation_runs
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT, INSERT ON cabinet_dealz.stripe_reconciliation_mismatches
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT, INSERT ON cabinet_dealz.stripe_payout_snapshots
  TO 'reconciliation_reader'@'10.%';
GRANT SELECT, INSERT ON cabinet_dealz.stripe_payout_transaction_snapshots
  TO 'reconciliation_reader'@'10.%';
```

The `UPDATE` privilege on `stripe_reconciliation_runs` is for run state only. The user must have no `UPDATE` or `DELETE` privilege on payments, invoices, refunds, commissions, payouts, or fulfillment tables.

Production credentials should be created and rotated through the deployment secret manager. Do not place the password in SQL files or source control.

## 3. Application-level read-only guard

Database permissions are the final boundary, but application code should also reject unsafe operations.

```ts
export type ReconciliationMutation =
  | "payment_status"
  | "invoice_total"
  | "refund_issue"
  | "payout_send"
  | "commission_update"
  | "fulfillment_release"
  | "historical_ledger_update";

const forbiddenForAutomaticRun = new Set<ReconciliationMutation>([
  "payment_status",
  "invoice_total",
  "refund_issue",
  "payout_send",
  "commission_update",
  "fulfillment_release",
  "historical_ledger_update",
]);

export function assertAutomaticRunIsReadOnly(action: ReconciliationMutation): void {
  if (forbiddenForAutomaticRun.has(action)) {
    throw new Error(`reconciliation_read_only_violation:${action}`);
  }
}
```

The automatic job may call functions such as:

```ts
await savePayoutSnapshot(...);
await savePayoutTransactionSnapshot(...);
await createMismatchFlag(...);
await finishReconciliationRun(...);
```

It must not import or call payment, refund, payout-transfer, invoice-update, or commission-settlement services.

## 4. Database trigger guard for historical tables

As a defense in depth, protect immutable historical records with triggers or application-managed append-only constraints.

```sql
DELIMITER //

CREATE TRIGGER prevent_payout_history_update
BEFORE UPDATE ON distributor_payout_ledger
FOR EACH ROW
BEGIN
  IF OLD.net_payable_cents <> NEW.net_payable_cents
     OR OLD.provider_transfer_id <> NEW.provider_transfer_id
     OR OLD.status <> NEW.status THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Historical payout ledger rows are immutable; use an adjustment entry';
  END IF;
END//

CREATE TRIGGER prevent_payout_history_delete
BEFORE DELETE ON distributor_payout_ledger
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Historical payout ledger rows cannot be deleted';
END//

DELIMITER ;
```

If the application uses migrations or a database platform where triggers are not preferred, enforce the same rule through a dedicated append-only table and a restricted data-access layer.

## 5. Mismatch state machine

```text
open
  → investigating
  → awaiting_approval
  → approved
  → executing
  → verification_required
  → verified
  → closed
```

Alternative paths:

```text
open → accepted_without_correction → closed
open → rejected → closed
approved → cancelled
executing → execution_failed → awaiting_approval
```

Meaning:

- `open`: automatically flagged; no manual action yet.
- `investigating`: operator is collecting evidence.
- `awaiting_approval`: proposed correction is ready for finance review.
- `approved`: required approver has approved the exact adjustment amount and target.
- `executing`: adjustment transaction is being posted.
- `verification_required`: correction is posted but provider/internal totals must be rechecked.
- `verified`: independent review confirms the corrected balance.
- `closed`: final audit record is complete.

## 6. Manual override tables

### Approval records

```sql
CREATE TABLE reconciliation_override_approvals (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  case_id BIGINT NOT NULL,
  approval_type ENUM('financial','operational','emergency') NOT NULL,
  requested_by BIGINT NOT NULL,
  approved_by BIGINT NULL,
  requested_amount_delta_cents BIGINT NULL,
  requested_target_table VARCHAR(128) NULL,
  requested_target_id BIGINT NULL,
  status ENUM('requested','approved','rejected','expired','withdrawn') NOT NULL DEFAULT 'requested',
  request_note TEXT NOT NULL,
  decision_note TEXT NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  CONSTRAINT override_case_fk FOREIGN KEY (case_id) REFERENCES ledger_reconciliation_cases(id),
  INDEX override_case_status_idx (case_id, status)
);
```

### Override audit log

```sql
CREATE TABLE reconciliation_override_audit (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  case_id BIGINT NOT NULL,
  actor_user_id BIGINT NOT NULL,
  action VARCHAR(64) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  ip_hash CHAR(64) NULL,
  user_agent_hash CHAR(64) NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT override_audit_case_fk FOREIGN KEY (case_id) REFERENCES ledger_reconciliation_cases(id),
  INDEX override_audit_case_time_idx (case_id, created_at)
);
```

## 7. Safe operator workflow

### Step 1 — View the flag

The operator can see:

- Stripe payout ID
- Stripe balance transaction IDs
- Internal payment, allocation, and sub-invoice IDs
- Distributor and affiliate
- Provider amount
- Internal expected amount
- Delta
- Currency
- Payload hashes
- First and last seen timestamps
- Existing effects and receipts
- Retry and DLQ history

The operator cannot edit amounts inline.

### Step 2 — Start investigation

```http
POST /admin/reconciliation/cases/88001/investigate
```

Server checks:

- Authenticated staff session
- Role is `reconciliation_operator` or higher
- Case is `open`
- Case is not already being processed by another operator

The server records an audit row and changes status to `investigating`.

### Step 3 — Attach evidence

Evidence should include:

- Stripe Dashboard/export reference
- Provider payout/transfer ID
- Provider amount and currency
- Internal payment and allocation rows
- Calculation showing the delta
- Whether a refund, payout, commission, or fulfillment effect already exists
- Operator note

Store hashes or references to sensitive provider exports rather than unnecessary raw payment data.

### Step 4 — Propose a correction

The operator submits an exact, immutable proposal:

```json
{
  "caseId": 88001,
  "adjustmentType": "payout",
  "targetTable": "distributor_payout_ledger",
  "targetId": 55001,
  "amountDeltaCents": -2000,
  "currency": "usd",
  "reason": "Verified provider transfer is $20.00 below internal payable ledger.",
  "evidenceReferences": [
    "stripe-payout-export:po_001",
    "internal-ledger-snapshot:55001"
  ]
}
```

The server recalculates and validates the proposed amount. It does not accept a browser-computed delta as authoritative.

### Step 5 — Obtain approval

The finance approver sees the exact:

```text
Original value
Provider value
Proposed delta
Target record
Distributor
Sub-invoice
Payment/reference
Reason
Evidence
```

The approver must explicitly approve or reject. Approval is bound to the exact case, target ID, amount, and currency. Changing any material field invalidates the approval.

### Step 6 — Execute the approved adjustment

Only the `ledger_adjuster` role can execute an approved correction. The execution transaction:

1. Locks the case and approval row.
2. Confirms approval is active and not expired.
3. Locks the original ledger row.
4. Confirms the original row still matches the approved `before_json` hash.
5. Inserts a separate append-only adjustment entry.
6. Links the entry to the reconciliation case.
7. Writes an audit record.
8. Changes the case to `verification_required`.
9. Commits.

It must not update the original historical ledger row.

### Step 7 — Verify independently

A second operator or automated verification job compares:

```text
original ledger amount + posted adjustment entries
= verified provider amount
```

The verifier confirms:

- No duplicate adjustment exists.
- The provider transfer is not duplicated.
- The correction did not cross distributor boundaries.
- Related commissions/refunds/fulfillment were not incorrectly changed.

Then the case changes to `verified` and finally `closed`.

## 8. Protected override endpoint

```ts
const overrideSchema = z.object({
  caseId: z.number().int().positive(),
  adjustmentType: z.enum(["payout", "allocation", "refund", "commission", "fulfillment_status"]),
  targetTable: z.literal("distributor_payout_ledger"),
  targetId: z.number().int().positive(),
  amountDeltaCents: z.number().int(),
  currency: z.string().length(3),
  reason: z.string().min(20).max(2_000),
  evidenceReferences: z.array(z.string().min(1)).min(1),
});

export async function proposeOverride(input: unknown, actor: StaffUser) {
  requireRole(actor, ["reconciliation_operator", "finance_approver"]);
  const proposal = overrideSchema.parse(input);

  return db.transaction(async (tx) => {
    const caseRow = await lockOpenCase(tx, proposal.caseId);
    const target = await lockPayoutLedger(tx, proposal.targetId);

    assertCaseTargetMatches(caseRow, target);
    assertCurrencyMatches(proposal.currency, "usd");
    assertProviderEvidenceSupportsDelta(caseRow, target, proposal.amountDeltaCents);
    assertNoExistingPostedAdjustment(tx, caseRow.id, target.id);

    const approval = await tx.insert(reconciliationOverrideApprovals).values({
      caseId: caseRow.id,
      approvalType: "financial",
      requestedBy: actor.id,
      requestedAmountDeltaCents: proposal.amountDeltaCents,
      requestedTargetTable: proposal.targetTable,
      requestedTargetId: proposal.targetId,
      status: "requested",
      requestNote: proposal.reason,
      expiresAt: addHours(new Date(), 24),
    });

    await tx.update(ledgerReconciliationCases)
      .set({ status: "awaiting_approval" })
      .where(eq(ledgerReconciliationCases.id, caseRow.id));

    await writeOverrideAudit(tx, {
      caseId: caseRow.id,
      actorUserId: actor.id,
      action: "override_proposed",
      after: proposal,
      note: proposal.reason,
    });

    return approval;
  });
}
```

## 9. Approval endpoint

```ts
export async function approveOverride(
  approvalId: number,
  actor: StaffUser,
  decisionNote: string,
) {
  requireRole(actor, ["finance_approver", "payments_admin"]);

  return db.transaction(async (tx) => {
    const approval = await lockApproval(tx, approvalId);
    const caseRow = await lockCase(tx, approval.caseId);

    if (approval.status !== "requested") throw new Error("approval_not_pending");
    if (approval.requestedBy === actor.id) throw new Error("four_eyes_rule_violation");
    if (approval.expiresAt && approval.expiresAt < new Date()) throw new Error("approval_expired");
    if (caseRow.status !== "awaiting_approval") throw new Error("case_not_awaiting_approval");

    await tx.update(reconciliationOverrideApprovals)
      .set({
        status: "approved",
        approvedBy: actor.id,
        decisionNote,
        decidedAt: new Date(),
      })
      .where(eq(reconciliationOverrideApprovals.id, approvalId));

    await tx.update(ledgerReconciliationCases)
      .set({ status: "approved" })
      .where(eq(ledgerReconciliationCases.id, approval.caseId));

    await writeOverrideAudit(tx, {
      caseId: approval.caseId,
      actorUserId: actor.id,
      action: "override_approved",
      before: { status: approval.status },
      after: { status: "approved", approvalId },
      note: decisionNote,
    });
  });
}
```

The four-eyes rule prevents the person who proposed the correction from approving it.

## 10. Execution transaction

```ts
export async function executeApprovedOverride(
  approvalId: number,
  actor: StaffUser,
) {
  requireRole(actor, ["ledger_adjuster"]);

  return db.transaction(async (tx) => {
    const approval = await lockApproval(tx, approvalId);
    const caseRow = await lockCase(tx, approval.caseId);
    const target = await lockPayoutLedger(tx, approval.requestedTargetId!);

    if (approval.status !== "approved") throw new Error("approval_not_active");
    if (caseRow.status !== "approved") throw new Error("case_not_approved");
    if (approval.approvedBy === actor.id) {
      // Optional stronger separation: require a third person for execution.
      throw new Error("approver_cannot_execute");
    }

    assertTargetStillMatchesApprovedBeforeState(caseRow, target);
    assertNoExistingPostedAdjustment(tx, caseRow.id, target.id);

    const adjustment = await tx.insert(distributorPayoutLedgerAdjustments).values({
      originalPayoutLedgerId: target.id,
      reconciliationCaseId: caseRow.id,
      subInvoiceId: target.subInvoiceId,
      distributorId: target.distributorId,
      paymentId: target.paymentId,
      allocationId: target.allocationId,
      adjustmentType: "provider_settlement_correction",
      amountDeltaCents: approval.requestedAmountDeltaCents!,
      providerTransferId: target.providerTransferId,
      status: "posted",
      note: "Approved append-only reconciliation correction.",
    });

    await tx.update(reconciliationOverrideApprovals)
      .set({ status: "approved" })
      .where(eq(reconciliationOverrideApprovals.id, approval.id));

    await tx.update(ledgerReconciliationCases)
      .set({ status: "verification_required" })
      .where(eq(ledgerReconciliationCases.id, caseRow.id));

    await writeOverrideAudit(tx, {
      caseId: caseRow.id,
      actorUserId: actor.id,
      action: "override_executed",
      after: { adjustmentId: adjustment.insertId },
      note: "Posted separate append-only adjustment entry.",
    });

    return adjustment;
  });
}
```

A production implementation should make the approval row immutable after execution and use a unique constraint such as:

```sql
UNIQUE (reconciliation_case_id, original_payout_ledger_id)
```

## 11. Verification endpoint

Verification should be separate from execution.

```ts
export async function verifyOverride(caseId: number, actor: StaffUser) {
  requireRole(actor, ["finance_approver", "reconciliation_operator"]);

  return db.transaction(async (tx) => {
    const caseRow = await lockCase(tx, caseId);
    if (caseRow.status !== "verification_required") {
      throw new Error("case_not_ready_for_verification");
    }

    const original = await loadOriginalPayout(tx, caseRow);
    const adjustments = await loadPostedAdjustments(tx, caseRow);
    const providerAmount = await loadVerifiedProviderAmount(caseRow);
    const correctedAmount = original.netPayableCents
      + adjustments.reduce((sum, row) => sum + row.amountDeltaCents, 0);

    if (correctedAmount !== providerAmount) {
      throw new Error("reconciliation_still_mismatched");
    }

    await tx.update(ledgerReconciliationCases)
      .set({
        status: "verified",
        resolvedBy: actor.id,
        resolvedAt: new Date(),
        resolution: `Verified corrected amount ${correctedAmount} cents against provider amount.`,
      })
      .where(eq(ledgerReconciliationCases.id, caseId));

    await writeOverrideAudit(tx, {
      caseId,
      actorUserId: actor.id,
      action: "override_verified",
      after: { correctedAmount, providerAmount },
      note: "Independent provider-to-ledger verification passed.",
    });
  });
}
```

## 12. Read-only UI behavior

The reconciliation dashboard should clearly separate **flag review** from **financial action**.

### Mismatch list

Show:

```text
Status: Open
Severity: Critical
Payout: po_...
Payment: 9001
Sub-invoice: CD-...-A
Distributor: Cabinet Line
Provider amount: $2,850.50
Internal amount: $2,870.50
Delta: -$20.00
```

Buttons:

- `[View evidence]`
- `[Start investigation]`
- `[Propose correction]`
- `[View approval history]`

Do not show a direct `[Fix]` or `[Mark paid]` button.

### Approval view

Show the exact immutable proposal:

- Original value
- Provider value
- Delta
- Target record
- Distributor and sub-invoice
- Evidence references
- Proposed reason
- Requesting user
- Approval deadline

Buttons:

- `[Approve exact correction]`
- `[Reject]`
- `[Request more evidence]`

### Execution view

Only the designated ledger-adjuster role sees:

- Approved case
- Approval identity
- Expiration
- Original-row hash
- Append-only adjustment preview

Button:

- `[Post approved adjustment]`

After execution, it changes to:

- `[View adjustment]`
- `[Run independent verification]`

## 13. Audit requirements

Every step must create an audit event:

```text
mismatch_created
investigation_started
evidence_attached
override_proposed
override_approved
override_rejected
override_executed
verification_passed
verification_failed
case_closed
```

The audit record must include:

- Case ID
- Actor ID and role
- Timestamp in UTC
- Action
- Before/after JSON where applicable
- Target table and record ID
- Amount and currency
- Evidence references
- Reason/note
- Correlation ID

## 14. Tests

Before enabling the workflow, verify:

1. The reconciliation DB user cannot update `payments`.
2. The reconciliation DB user cannot update `distributor_payout_ledger`.
3. Automatic runs can insert flags but cannot execute adjustments.
4. An operator cannot approve their own proposal.
5. An approval expires and cannot execute after expiry.
6. Changing the target or amount invalidates the approval.
7. The original ledger row remains byte-for-byte unchanged.
8. One case cannot post two adjustments for the same target.
9. A stale adjustment fails original-row hash validation.
10. Execution creates one append-only correction entry.
11. Verification fails if corrected amount still differs from provider amount.
12. A verified case cannot be executed again.
13. All actions appear in the audit log.
14. A distributor correction cannot modify another distributor’s sub-invoice.
15. A payout-only correction does not change affiliate commission unless separately approved.

## Implementation status

This is a **proposed read-only safety and manual-override design only**. No permissions, triggers, endpoints, migrations, financial adjustments, or production schedules have been changed.