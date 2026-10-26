# Webhook Disaster Recovery and Ledger Reconciliation Playbook

## Purpose

This playbook handles persistent webhook delivery failures, dead-letter buildup, payment-to-ledger mismatches, duplicate effects, database recovery, and safe replay for distributor-level split orders.

It covers:

- `distributor_sub_invoice.paid`
- Payment allocations
- Distributor payout ledgers
- Affiliate commissions
- Fulfillment events
- Returns and refunds
- Customer notification status
- Outbox and dead-letter records

The goal is to restore service **without charging twice, refunding twice, paying a distributor twice, or creating duplicate commissions or fulfillment instructions**.

This is a proposed operational document. It does not change production systems, payment behavior, or database configuration.

## 1. Recovery principles

1. **Preserve evidence first.** Do not delete outbox, DLQ, receipt, payment, refund, or audit records during an incident.
2. **Payments are provider-confirmed.** The payment provider transaction and signed event are the source for whether money moved.
3. **Internal ledgers are the source for application accounting state.** Provider data does not automatically tell us which distributor allocation, commission, or fulfillment effects were committed.
4. **The original event is immutable.** Corrections are represented by reconciliation or adjustment records.
5. **Replay is idempotent.** Never bypass receipt locks or business uniqueness constraints.
6. **Freeze financial side effects before repairing mismatches.** Stop payout, commission settlement, and fulfillment release when their inputs are uncertain.
7. **A parent order can remain partially recovered.** Repair one distributor sub-invoice without changing another distributor’s records.
8. **Every manual action is audited.** Record operator, timestamp, reason, evidence, and before/after values.
9. **Never use browser totals as financial truth.** Recalculate from server records and provider confirmations.
10. **Do not mark an incident resolved until independent reconciliation passes.**

## 2. Severity classification

### SEV-1 — financial or fulfillment integrity risk

Use when any of the following occurs:

- A payment is confirmed but its distributor allocation is unknown.
- A payment, refund, payout, or commission may have happened twice.
- Provider amount differs from the stored allocation.
- A paid sub-invoice has no reliable fulfillment state.
- A restore may have lost committed financial records.
- A large or growing production DLQ affects required consumers.

Immediate actions:

- Freeze distributor payouts, affiliate commission settlement, and automatic fulfillment release.
- Preserve database and provider evidence.
- Page engineering and finance/admin owners.
- Create an incident record.

### SEV-2 — persistent delivery failure

Use when:

- A required consumer has open DLQ items older than its SLO.
- Worker leases repeatedly expire.
- One distributor integration is unavailable.
- Retry queues grow continuously without a direct financial mismatch.

Actions:

- Keep payment intake available only if the payment-to-ledger path remains trustworthy.
- Pause the affected downstream consumer.
- Repair configuration or dependency.
- Replay after validation.

### SEV-3 — noncritical notification or reporting failure

Use when:

- Customer emails are delayed but order state is correct.
- An optional reporting consumer is behind.
- Duplicate deliveries are being safely suppressed.

Actions:

- Continue core payment and fulfillment processing.
- Monitor queue age and resolve during normal operations.

## 3. Roles

| Role | Responsibility |
|---|---|
| Incident commander | Owns decisions, timeline, escalation, and resolution. |
| Engineering lead | Controls workers, database, replay, and code/configuration changes. |
| Finance/admin owner | Approves payment, refund, payout, commission, and ledger corrections. |
| Fulfillment/operations owner | Confirms distributor inventory, PO, shipment, and customer impact. |
| Communications owner | Sends internal, affiliate, distributor, or customer updates. |
| Scribe | Maintains the incident log and evidence index. |

No one person should both approve and execute a financial adjustment without a documented exception.

## 4. Immediate containment

### 4.1 Declare the incident

Record:

```text
Incident ID:
Detected at:
Environment:
Severity:
Primary symptoms:
Affected event types:
Affected consumers:
Affected distributors:
Incident commander:
Engineering lead:
Finance/admin owner:
```

### 4.2 Freeze risky automation

Pause or gate:

- Distributor payout transfers
- Affiliate commission batch settlement
- Automatic fulfillment release
- Automatic return refunds
- Automatic retry for the affected consumer if retries could worsen a duplicate-effect risk

Do not delete or cancel the events. Mark the consumer or workflow as paused with an audit record.

### 4.3 Preserve evidence

Capture immutable or read-only exports of:

- Provider event IDs and event payloads
- Provider payment, refund, and transfer records
- `order_requests`
- `distributor_sub_invoices`
- `distributor_sub_invoice_lines`
- `payments`
- `order_payment_allocations`
- `distributor_refunds`
- `distributor_refund_allocations`
- `affiliate_commission_entries`
- `distributor_payout_ledger`
- `distributor_fulfillment_events`
- `webhook_outbox`
- `webhook_dead_letters`
- `webhook_event_receipts`
- Worker logs and deployment versions
- Monitoring screenshots or metric snapshots

Compute a checksum for each export and store it in the incident record.

### 4.4 Stop destructive maintenance

During SEV-1 or an uncertain restore:

- Do not run cleanup jobs.
- Do not purge old webhook rows.
- Do not delete failed payments.
- Do not edit historical invoice totals in place.
- Do not manually mark rows paid, refunded, or fulfilled without a reconciliation record.

## 5. Establish the authoritative timeline

For each affected sub-invoice, construct this timeline:

```text
Order created
→ Sub-invoice created
→ Shipping quote accepted
→ Payment initiated
→ Provider payment approved
→ Internal payment recorded
→ Allocation recorded
→ paid event created
→ Consumer receipt claimed
→ Business effect committed
→ Fulfillment released
→ PO sent
→ Shipment created
→ Return/refund, if any
```

Use UTC for all comparisons. Preserve provider timestamps and internal timestamps separately; do not overwrite one with the other.

## 6. Source-of-truth hierarchy

When records disagree, use this order of authority:

### Money movement

1. Provider’s verified payment/refund/transfer record
2. Signed provider webhook payload
3. Internal payment record
4. Payment allocation record
5. Sub-invoice totals and payment rollups

### Business effects

1. Committed internal ledger row with a unique business key
2. Consumer receipt marked `processed`
3. Fulfillment/payout/commission event
4. Outbox or DLQ record
5. Worker log

Logs prove an attempt, not a committed business effect.

### Catalog and pricing snapshots

1. Immutable invoice line snapshot
2. Order line snapshot
3. Current catalog data only for future orders

Never reprice a historical order during reconciliation.

## 7. Triage decision tree

```text
Was money moved by the provider?
  No → mark payment attempt failed/pending according to provider truth; no fulfillment release.
  Yes
    |
    v
Does the internal payment row exist?
  No → create a reconciliation exception; do not charge again.
  Yes
    |
    v
Does the payment allocation match provider amount and sub-invoice?
  No → SEV-1 financial mismatch; freeze downstream effects.
  Yes
    |
    v
Does the paid event exist?
  No → create an outbox reconciliation event from the immutable payment record.
  Yes
    |
    v
Is the required consumer receipt processed?
  No → repair/replay consumer.
  Yes
    |
    v
Does the business effect exist exactly once?
  No → replay idempotently or create a reviewed adjustment.
  Yes → verify rollups and close the incident for this sub-invoice.
```

## 8. Reconcile provider payments to internal payments

Export the provider’s authoritative payment list for the incident window:

```text
provider_payment_id
provider_event_id
amount
currency
status
created_at
captured_at
refunded_amount
metadata.orderRequestId
metadata.subInvoiceId
metadata.paymentId
metadata.allocationId
```

Compare to internal records:

```sql
SELECT
  p.id AS internal_payment_id,
  p.order_request_id,
  p.provider,
  p.transaction_id,
  p.status,
  p.amount_cents,
  p.merchandise_cents,
  p.freight_cents,
  p.created_at,
  opa.id AS allocation_id,
  opa.sub_invoice_id,
  opa.allocated_amount,
  opa.refunded_amount
FROM payments p
LEFT JOIN order_payment_allocations opa ON opa.payment_id = p.id
WHERE p.created_at >= :incident_start
  AND p.created_at < :incident_end
ORDER BY p.created_at, p.id;
```

Classify every discrepancy:

| Code | Meaning | Action |
|---|---|---|
| `provider_only` | Provider shows money, internal payment missing | Do not charge again; create payment reconciliation case. |
| `internal_only` | Internal payment exists, provider has no approval | Mark pending/error only after provider confirmation; no fulfillment. |
| `amount_mismatch` | Amounts differ | Freeze downstream effects; finance review. |
| `currency_mismatch` | Currency differs | Freeze and investigate. |
| `duplicate_provider_ref` | One provider transaction mapped twice | Preserve both mappings; repair allocation links. |
| `duplicate_internal_effect` | One payment created multiple effects | Reverse only with approved ledger adjustment. |

## 9. Reconcile payment allocations

For each approved payment:

```sql
SELECT
  p.id AS payment_id,
  p.transaction_id,
  p.amount_cents AS provider_recorded_amount,
  COALESCE(SUM(opa.allocated_amount), 0) AS allocated_amount,
  COUNT(opa.id) AS allocation_count
FROM payments p
LEFT JOIN order_payment_allocations opa ON opa.payment_id = p.id
WHERE p.status IN ('approved', 'succeeded', 'paid')
GROUP BY p.id, p.transaction_id, p.amount_cents
HAVING p.amount_cents <> COALESCE(SUM(opa.allocated_amount), 0);
```

Required result:

```text
provider amount = allocation sum
allocation sum = selected sub-invoice totals
allocation distributor = sub-invoice distributor
allocation currency = order currency
```

Do not repair an allocation by overwriting it. Create a `payment_reconciliation_adjustments` row with:

```text
case number
payment ID
old allocation
new proposed allocation
provider evidence
finance approver
engineer executor
reason
created at
```

## 10. Reconcile the paid event and outbox

### Find payments with no paid event

```sql
SELECT
  si.id AS sub_invoice_id,
  si.invoice_number,
  si.paid_at,
  p.id AS payment_id,
  p.transaction_id
FROM distributor_sub_invoices si
JOIN order_payment_allocations opa ON opa.sub_invoice_id = si.id
JOIN payments p ON p.id = opa.payment_id
LEFT JOIN webhook_outbox o
  ON o.aggregate_type = 'distributor_sub_invoice'
 AND o.aggregate_id = si.id
 AND o.event_type = 'distributor_sub_invoice.paid'
WHERE si.status IN ('paid', 'partially_paid')
  AND p.status IN ('approved', 'succeeded', 'paid')
  AND o.id IS NULL;
```

For a valid missing event, create a new reconciliation event with:

```text
new event ID
source = reconciliation
original payment ID
original allocation ID
original provider reference
operator/case ID
payload hash
```

Never reuse an old event ID with modified data.

### Find events stuck in retry or DLQ

```sql
SELECT
  o.event_id,
  o.event_type,
  o.aggregate_id,
  o.status,
  o.attempts,
  o.last_error_code,
  o.last_error_message,
  dl.consumer_name,
  dl.status AS dlq_status
FROM webhook_outbox o
LEFT JOIN webhook_dead_letters dl ON dl.event_id = o.event_id
WHERE o.status IN ('processing', 'retry_wait', 'dead_letter')
   OR dl.status IN ('open', 'replaying')
ORDER BY o.created_at;
```

## 11. Reconcile consumer receipts and effects

For each event and required consumer, verify:

```text
receipt exists
receipt payload hash matches event
receipt status = processed
business effect exists exactly once
business effect references event ID
business effect references correct sub-invoice/distributor
```

### Commission reconciliation

```sql
SELECT
  si.id AS sub_invoice_id,
  si.distributor_id,
  COUNT(DISTINCT ce.id) AS commission_entries,
  COALESCE(SUM(ce.payable_amount), 0) AS payable_commission
FROM distributor_sub_invoices si
LEFT JOIN affiliate_commission_entries ce ON ce.sub_invoice_id = si.id
WHERE si.status IN ('paid', 'partially_paid')
GROUP BY si.id, si.distributor_id;
```

### Fulfillment reconciliation

```sql
SELECT
  si.id AS sub_invoice_id,
  si.invoice_number,
  si.distributor_id,
  si.status AS invoice_status,
  MAX(CASE WHEN fe.event_type = 'payment_received' THEN fe.created_at END) AS payment_event_at,
  MAX(CASE WHEN fe.event_type = 'fulfillment_released' THEN fe.created_at END) AS released_at,
  MAX(CASE WHEN fe.event_type = 'po_sent' THEN fe.created_at END) AS po_sent_at
FROM distributor_sub_invoices si
LEFT JOIN distributor_fulfillment_events fe ON fe.sub_invoice_id = si.id
WHERE si.paid_at IS NOT NULL
GROUP BY si.id, si.invoice_number, si.distributor_id, si.status;
```

A paid invoice with a PO sent before payment or without an approved release is a control exception and requires review.

## 12. Persistent delivery failure procedure

### Phase A — contain

1. Pause the affected consumer.
2. Freeze payout, commission settlement, and fulfillment release if the consumer is financially or operationally required.
3. Keep the outbox and DLQ intact.
4. Capture metrics, logs, deployment version, and provider status.
5. Confirm whether payment intake remains safe.

### Phase B — diagnose

1. Identify the oldest event and first failure reason.
2. Determine whether failure is code, configuration, dependency, authentication, schema, or data.
3. Check if multiple distributors or only one distributor are affected.
4. Check whether failures began after a deployment.
5. Compare worker lease expiry to database latency.
6. Confirm no business effects were partially committed.

### Phase C — repair

1. Correct configuration or deploy the reviewed fix.
2. Run a single-event canary replay in a nonproduction environment.
3. Verify receipt, ledger effect, and business status.
4. Replay one production event for the affected consumer.
5. Verify no duplicate effects.
6. Increase replay gradually in bounded batches.

### Phase D — recover

1. Replay failed consumer rows oldest-first.
2. Keep financial and fulfillment replays separately rate-limited.
3. Watch queue depth, age, failure rate, and payment-to-fulfillment lag.
4. Resume payout/settlement only after reconciliation passes.
5. Send delayed customer/distributor notifications if needed.

### Phase E — close

1. Confirm DLQ is empty or has documented exceptions.
2. Confirm no paid sub-invoice lacks required effects.
3. Confirm no duplicate provider or internal financial effects.
4. Obtain finance/admin approval.
5. Record root cause and prevention items.

## 13. Database restore procedure

A restore is a separate incident from replay. Do not restore over production without an approved change window and a verified backup.

### 13.1 Choose the recovery point

Determine:

```text
Last known good backup:
Point-in-time recovery target:
Provider event export cutoff:
Internal database transaction cutoff:
Expected RPO:
Expected RTO:
```

Use the latest restore point **before the first known corruption or mismatch**, not merely the latest backup.

### 13.2 Restore into an isolated environment first

1. Create a new isolated database instance.
2. Restore the backup and binlogs to the selected point.
3. Verify schema version and migration journal.
4. Run consistency checks.
5. Load provider exports for the affected time window.
6. Compare restored rows to preserved production snapshots.
7. Obtain incident commander and finance approval before cutover.

### 13.3 Restore consistency checks

```sql
CHECK TABLE order_requests;
CHECK TABLE payments;
CHECK TABLE order_payment_allocations;
CHECK TABLE distributor_sub_invoices;
CHECK TABLE distributor_refunds;
CHECK TABLE affiliate_commission_entries;
CHECK TABLE webhook_outbox;
CHECK TABLE webhook_dead_letters;
CHECK TABLE webhook_event_receipts;
```

Then check:

```sql
-- No negative money totals
SELECT * FROM distributor_sub_invoices
WHERE total_amount < 0 OR paid_amount < 0 OR refunded_amount < 0;

-- No refunded amount above paid amount
SELECT * FROM distributor_sub_invoices
WHERE refunded_amount > paid_amount;

-- No duplicate event/consumer receipts
SELECT event_id, consumer_name, COUNT(*)
FROM webhook_event_receipts
GROUP BY event_id, consumer_name
HAVING COUNT(*) > 1;

-- No duplicate provider transaction references
SELECT transaction_id, COUNT(*)
FROM payments
WHERE transaction_id IS NOT NULL
GROUP BY transaction_id
HAVING COUNT(*) > 1;
```

### 13.4 Cutover

Only after isolated verification:

1. Pause writes or enter controlled maintenance mode.
2. Capture a final provider event/payment export.
3. Capture a final production database snapshot.
4. Apply the chosen restore or corrected migration.
5. Reconcile the delta between restore point and final provider export.
6. Start workers in paused-claim mode.
7. Validate health checks and read-only dashboards.
8. Enable workers one consumer at a time.
9. Monitor for duplicate or mismatch signals.
10. End maintenance mode after approval.

## 14. Safe reconciliation adjustments

Use append-only adjustment tables rather than editing historical rows.

```sql
CREATE TABLE ledger_reconciliation_cases (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  case_number VARCHAR(64) NOT NULL UNIQUE,
  order_request_id BIGINT NULL,
  sub_invoice_id BIGINT NULL,
  payment_id BIGINT NULL,
  severity ENUM('sev1','sev2','sev3') NOT NULL,
  issue_type ENUM(
    'payment_missing_internal',
    'payment_missing_provider',
    'allocation_mismatch',
    'duplicate_effect',
    'missing_webhook',
    'missing_fulfillment',
    'missing_commission',
    'refund_mismatch',
    'restore_delta'
  ) NOT NULL,
  status ENUM('open','investigating','awaiting_approval','correcting','verified','closed') NOT NULL DEFAULT 'open',
  provider_evidence_hash CHAR(64) NULL,
  internal_evidence_hash CHAR(64) NULL,
  root_cause TEXT NULL,
  resolution TEXT NULL,
  opened_by BIGINT NOT NULL,
  approved_by BIGINT NULL,
  resolved_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX reconciliation_status_idx (status, severity),
  INDEX reconciliation_order_idx (order_request_id, sub_invoice_id)
);

CREATE TABLE ledger_reconciliation_adjustments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  case_id BIGINT NOT NULL,
  adjustment_type ENUM('payment','allocation','refund','payout','commission','fulfillment_status') NOT NULL,
  target_table VARCHAR(128) NOT NULL,
  target_id BIGINT NOT NULL,
  amount_delta_cents BIGINT NULL,
  before_json JSON NOT NULL,
  after_json JSON NOT NULL,
  reason TEXT NOT NULL,
  approved_by BIGINT NOT NULL,
  executed_by BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT adjustment_case_fk FOREIGN KEY (case_id) REFERENCES ledger_reconciliation_cases(id),
  INDEX adjustment_target_idx (target_table, target_id)
);
```

Approval rules:

- A SEV-1 money adjustment requires finance/admin approval.
- A duplicate-effect correction requires engineering plus finance/admin review.
- A status-only correction may use operations approval if no money is affected.
- The original record is never silently replaced.

## 15. Duplicate effect handling

### Duplicate payment allocation

1. Freeze all downstream effects for the payment.
2. Compare provider reference, amount, currency, and customer.
3. Identify the canonical allocation.
4. Mark the duplicate as a reconciliation exception, not as a second payment.
5. If money moved twice, initiate provider refund only after finance approval.
6. Link the refund to the duplicate payment transaction.

### Duplicate commission

1. Identify the canonical commission entry by source event, line, and affiliate.
2. Mark the duplicate entry void or create a negative adjustment according to the accounting system.
3. Do not edit the historical paid commission amount.
4. Reconcile the affiliate payout batch.

### Duplicate fulfillment/PO

1. Stop additional PO sends.
2. Contact the distributor before production or shipment.
3. Mark one PO canonical.
4. Cancel the duplicate only through the distributor’s documented process.
5. Record distributor confirmation in the incident case.

## 16. Missing effect handling

### Missing commission

If payment and invoice are correct but commission is missing:

1. Confirm the order qualifies for commission.
2. Verify locked sale price and source cost snapshot.
3. Generate a new reconciliation event or replay the commission consumer.
4. Verify exactly one commission entry.
5. Do not alter the distributor invoice.

### Missing fulfillment

If payment is confirmed but fulfillment is missing:

1. Confirm inventory and affiliate approval requirements.
2. Replay the fulfillment consumer.
3. Verify one fulfillment event and one task/PO.
4. Confirm distributor received only its own sub-invoice lines.

### Missing customer notification

If all accounting and fulfillment records are correct:

1. Replay the notification consumer only.
2. Mark the notification as delivered through its unique event/recipient key.
3. Avoid resending duplicate payment confirmation if the customer already received it.

## 17. Refund and return reconciliation

For each refund:

```text
provider refund amount
= internal refund total
= sum of refund allocations
= approved return-line refund + approved shipping/tax/fee treatment
```

Query possible refund over-allocation:

```sql
SELECT
  r.id AS refund_id,
  r.total_amount,
  COALESCE(SUM(ra.allocated_amount), 0) AS allocated_refund,
  r.original_payment_id
FROM distributor_refunds r
LEFT JOIN distributor_refund_allocations ra ON ra.refund_id = r.id
WHERE r.status = 'issued'
GROUP BY r.id, r.total_amount, r.original_payment_id
HAVING r.total_amount <> COALESCE(SUM(ra.allocated_amount), 0);
```

Never replay a refund event until the provider’s refund status is known. A network timeout after submitting a refund is not proof that the refund failed; query the provider by idempotency key or refund reference first.

## 18. Recovery validation checklist

### Queue and worker

- [ ] No unexplained `processing` rows older than the lease.
- [ ] No growing retry queue.
- [ ] Worker heartbeats healthy.
- [ ] DLQ count and oldest age within target.
- [ ] All replay batches completed or documented.

### Payments

- [ ] Provider approved payments match internal payment records.
- [ ] Provider amounts equal internal allocations.
- [ ] Provider currencies match.
- [ ] No duplicate provider transaction mapping.
- [ ] No duplicate payment allocation.

### Sub-invoices

- [ ] Each sub-invoice belongs to exactly one distributor.
- [ ] Paid, balance, and refund totals roll up correctly.
- [ ] Parent order status reflects the slowest required distributor state.
- [ ] One distributor’s correction did not change another distributor’s totals.

### Commissions

- [ ] Paid eligible lines have exactly one commission effect.
- [ ] Returned lines have corresponding reversals where required.
- [ ] No commission is calculated on shipping or tax unless explicitly configured.
- [ ] Commission batch totals reconcile to the affiliate ledger.

### Fulfillment

- [ ] Paid sub-invoices have the required fulfillment event.
- [ ] No PO was sent before release approval.
- [ ] Distributor PO contains only that distributor’s lines.
- [ ] Duplicate shipment or PO risks are resolved.

### Refunds

- [ ] Provider refund status matches internal refund status.
- [ ] Refund amount equals refund allocations.
- [ ] Refund does not cross distributor boundaries.
- [ ] Return quantity does not exceed shipped quantity.

### Customer and affiliate communication

- [ ] Paid and unpaid sub-invoice statuses are accurate.
- [ ] Payment confirmations are not duplicated.
- [ ] Delayed notices are sent only when needed.
- [ ] Affiliate commission status is accurate.

## 19. Recovery commands should be gated

Every operational command should support:

```text
--environment production
--case CASE-2026-0041
--dry-run
--consumer distributor-fulfillment
--event-id evt_...
--limit 10
--operator 7
--reason "Corrected distributor email configuration"
```

Default behavior should be dry-run. Production execution should require:

- Authenticated administrator
- Open reconciliation case
- Explicit consumer/event scope
- Confirmation of provider and ledger evidence
- Audit note

Never provide an unrestricted “replay all DLQ” command.

## 20. Post-incident review

Within two business days, document:

```text
Incident ID:
Root cause:
Detection gap:
Containment time:
Recovery time:
Orders affected:
Sub-invoices affected:
Payments affected:
Refunds affected:
Commissions affected:
Duplicate effects:
Customer/distributor impact:
Data corrected:
Preventive changes:
Owner and due date for each change:
```

Classify root cause:

- Code defect
- Schema/migration defect
- Provider outage
- Credential/configuration error
- Database failure
- Worker scaling/lease issue
- Duplicate delivery handling gap
- Manual operational error

Preventive actions may include:

- New business uniqueness constraint
- New reconciliation query
- Better provider metadata
- Consumer timeout adjustment
- DLQ alert threshold
- Restore drill
- Canary replay test
- Deployment gate for webhook consumers

## 21. Recovery drill schedule

Recommended drills:

| Drill | Frequency | Success criteria |
|---|---|---|
| Worker crash after receipt claim | Monthly | Lease recovers; one business effect. |
| Provider timeout after payment approval | Monthly | No duplicate charge; event is retried safely. |
| Consumer dead-letter replay | Monthly | Failed consumer replays exactly once. |
| Database point-in-time restore | Quarterly | Restore and reconciliation meet RTO/RPO. |
| Duplicate refund notification | Quarterly | Refund is not issued twice. |
| Distributor integration outage | Quarterly | One distributor pauses without affecting others. |
| Full split-order reconciliation | Quarterly | Provider, invoice, allocation, commission, and fulfillment totals match. |

Use synthetic test orders and provider sandbox data. Never use a live customer order for a disaster recovery drill.

## 22. Final resolution standard

The incident may be closed only when:

1. The root cause is fixed or an approved workaround is active.
2. Payment, refund, payout, commission, and fulfillment ledgers reconcile.
3. Required consumer receipts are processed exactly once.
4. No open SEV-1 financial dead letters remain without an owner and plan.
5. Customer and distributor statuses are accurate.
6. Monitoring confirms the queue is stable.
7. The finance/admin owner approves financial closure.
8. The incident record contains evidence, adjustments, and operator approvals.

## Implementation status

This is a **proposed disaster recovery and reconciliation playbook only**. No production recovery operation, database restore, payment adjustment, webhook replay, alert change, or ledger correction has been performed.