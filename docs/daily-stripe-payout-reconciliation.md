# Automated Daily Stripe Payout Reconciliation

## Scope

This is the proposed design for a daily application-owned job that compares Stripe payouts with the internal payment, allocation, refund, payout, and reconciliation ledgers.

It is designed to:

- Run once daily after the expected Stripe payout window
- Retrieve Stripe payouts and their included balance transactions
- Compare provider totals with internal ledger totals
- Create immutable reconciliation snapshots
- Flag mismatches without rewriting historical records
- Alert administrators and finance owners
- Retry transient failures safely
- Avoid duplicate reconciliation runs
- Keep distributor sub-invoices isolated

No schedule, Stripe connector, database migration, or production job has been enabled.

## Stripe data used

Stripe’s official payout reconciliation flow identifies a payout by its `po_...` ID and retrieves the included balance transactions by passing the payout ID to the Balance Transactions API. Stripe says that the payout’s individual transactions are not included on the basic Payout object; they are queried separately. See:

- [Stripe payout reconciliation](https://docs.stripe.com/payouts/reconciliation)
- [Stripe Payout object](https://docs.stripe.com/api/payouts/object)

The job should only reconcile payouts whose `reconciliation_status` is `completed` when the underlying balance transactions are required. Payouts still `pending` or `in_progress` should remain open and be checked on a later run.

## 1. Daily schedule

Recommended schedule:

```text
Every day at 03:30 America/Chicago
Reconcile the previous UTC calendar day plus a rolling seven-day lookback
```

The lookback is important because Stripe payouts can be delayed, change status, or become reconciled after the first run.

Example window:

```text
runDateUtc       = 2026-10-09
windowStartUtc   = 2026-10-02T00:00:00Z
windowEndUtc     = 2026-10-10T00:00:00Z
```

Do not assume that “daily” means one fixed payout per day. Stripe payouts can include multiple days of transactions, and automatic payout timing varies.

## 2. Required tables

### Reconciliation runs

```sql
CREATE TABLE stripe_reconciliation_runs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  run_key VARCHAR(128) NOT NULL,
  window_start_utc TIMESTAMP NOT NULL,
  window_end_utc TIMESTAMP NOT NULL,
  status ENUM('running','completed','completed_with_mismatches','failed') NOT NULL,
  payout_count INT NOT NULL DEFAULT 0,
  mismatch_count INT NOT NULL DEFAULT 0,
  error_code VARCHAR(128) NULL,
  error_message TEXT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY reconciliation_run_key_unique (run_key),
  INDEX reconciliation_run_status_idx (status, started_at)
);
```

`run_key` should be deterministic, for example:

```text
stripe-payout-reconciliation:2026-10-09:2026-10-02T00:00:00Z:2026-10-10T00:00:00Z
```

The unique key prevents duplicate daily runs.

### Stripe payout snapshots

```sql
CREATE TABLE stripe_payout_snapshots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  reconciliation_run_id BIGINT NOT NULL,
  stripe_payout_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  reconciliation_status VARCHAR(32) NULL,
  amount_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  arrival_date_utc TIMESTAMP NULL,
  payout_created_at_utc TIMESTAMP NULL,
  balance_transaction_id VARCHAR(64) NULL,
  destination_id VARCHAR(128) NULL,
  stripe_payload_hash CHAR(64) NOT NULL,
  retrieved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY payout_run_unique (reconciliation_run_id, stripe_payout_id),
  UNIQUE KEY payout_latest_identity_unique (stripe_payout_id, stripe_payload_hash),
  CONSTRAINT payout_snapshot_run_fk FOREIGN KEY (reconciliation_run_id)
    REFERENCES stripe_reconciliation_runs(id)
);
```

### Stripe payout transaction snapshots

```sql
CREATE TABLE stripe_payout_transaction_snapshots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  payout_snapshot_id BIGINT NOT NULL,
  stripe_balance_transaction_id VARCHAR(64) NOT NULL,
  transaction_type VARCHAR(128) NOT NULL,
  source_id VARCHAR(128) NULL,
  amount_cents BIGINT NOT NULL,
  fee_cents BIGINT NOT NULL DEFAULT 0,
  net_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  available_on_utc TIMESTAMP NULL,
  stripe_payload_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY payout_transaction_unique (payout_snapshot_id, stripe_balance_transaction_id),
  CONSTRAINT payout_transaction_snapshot_fk FOREIGN KEY (payout_snapshot_id)
    REFERENCES stripe_payout_snapshots(id)
);
```

### Mismatch records

```sql
CREATE TABLE stripe_reconciliation_mismatches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  reconciliation_run_id BIGINT NOT NULL,
  stripe_payout_id VARCHAR(64) NULL,
  order_request_id BIGINT NULL,
  sub_invoice_id BIGINT NULL,
  payment_id BIGINT NULL,
  severity ENUM('warning','high','critical') NOT NULL,
  mismatch_type ENUM(
    'provider_payout_total_mismatch',
    'unmapped_stripe_transaction',
    'internal_payment_missing',
    'provider_payment_missing',
    'allocation_mismatch',
    'refund_mismatch',
    'duplicate_provider_reference',
    'currency_mismatch',
    'payout_not_reconciled'
  ) NOT NULL,
  provider_amount_cents BIGINT NULL,
  internal_amount_cents BIGINT NULL,
  delta_cents BIGINT NULL,
  currency CHAR(3) NULL,
  status ENUM('open','investigating','resolved','accepted') NOT NULL DEFAULT 'open',
  evidence_json JSON NOT NULL,
  resolution_note TEXT NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  resolved_by BIGINT NULL,
  UNIQUE KEY mismatch_identity_unique (
    reconciliation_run_id,
    stripe_payout_id,
    payment_id,
    mismatch_type
  ),
  CONSTRAINT mismatch_run_fk FOREIGN KEY (reconciliation_run_id)
    REFERENCES stripe_reconciliation_runs(id)
);
```

## 3. Reconciliation rules

### Payout-level rule

For a completed payout:

```text
Stripe payout.amount
= sum of the payout’s balance-transaction net amounts
```

The job should use the provider’s payout and balance-transaction data as a consistency check, then compare the provider transactions to the internal ledger.

### Internal ledger rule

For each mapped distributor payment allocation:

```text
internal payment allocation
− internal refund allocation
− explicitly retained fees
= expected internal net impact
```

The exact formula depends on whether the Stripe account receives gross customer charges, application fees, connected-account transfers, or other flows. Do not assume that a Stripe payout amount equals the total of customer invoice subtotals.

### Mapping rule

Every relevant Stripe balance transaction must map through a stable reference, preferably:

```text
Stripe transaction/source metadata
→ payment provider reference
→ internal payment
→ order payment allocation
→ distributor sub-invoice
```

If a transaction has no safe mapping, create `unmapped_stripe_transaction`; do not guess the distributor or order.

## 4. Stripe client service

```ts
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

export async function listPayoutsInWindow(
  startUnix: number,
  endUnix: number,
): Promise<Stripe.Payout[]> {
  const payouts: Stripe.Payout[] = [];

  for await (const payout of stripe.payouts.list({
    created: { gte: startUnix, lt: endUnix },
    limit: 100,
  })) {
    payouts.push(payout);
  }

  return payouts;
}

export async function listPayoutBalanceTransactions(
  payoutId: string,
): Promise<Stripe.BalanceTransaction[]> {
  const transactions: Stripe.BalanceTransaction[] = [];

  for await (const transaction of stripe.balanceTransactions.list({
    payout: payoutId,
    limit: 100,
    expand: ["data.source"],
  })) {
    transactions.push(transaction);
  }

  return transactions;
}
```

Pin the Stripe API version used by the project and test the service against Stripe test mode before production use. Do not read or log the secret key from user messages.

## 5. Idempotent daily job

```ts
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "../db";
import {
  stripeReconciliationRuns,
  stripePayoutSnapshots,
  stripePayoutTransactionSnapshots,
} from "../../drizzle/schema";

export async function runDailyStripeReconciliation(now = new Date()) {
  const windowEnd = startOfUtcDay(addUtcDays(now, 1));
  const windowStart = addUtcDays(windowEnd, -7);
  const runKey = [
    "stripe-payout-reconciliation",
    windowEnd.toISOString(),
    windowStart.toISOString(),
  ].join(":");

  const run = await claimRun(runKey, windowStart, windowEnd);
  if (run.action === "already_complete") return run.runId;
  if (run.action === "already_running") return run.runId;

  try {
    const payouts = await listPayoutsInWindow(
      Math.floor(windowStart.getTime() / 1000),
      Math.floor(windowEnd.getTime() / 1000),
    );

    let mismatchCount = 0;
    for (const payout of payouts) {
      const result = await reconcilePayout(run.runId, payout);
      mismatchCount += result.mismatchCount;
    }

    await finishRun(
      run.runId,
      mismatchCount === 0 ? "completed" : "completed_with_mismatches",
      payouts.length,
      mismatchCount,
    );

    if (mismatchCount > 0) {
      await notifyReconciliationMismatches(run.runId);
    }

    return run.runId;
  } catch (error) {
    await failRun(run.runId, classifyError(error));
    throw error;
  }
}
```

`claimRun` must use a unique key and a transaction. If the scheduler runs twice, only one run claims the same window.

## 6. Claiming a run safely

```ts
async function claimRun(
  runKey: string,
  windowStartUtc: Date,
  windowEndUtc: Date,
): Promise<
  | { action: "claimed"; runId: number }
  | { action: "already_complete"; runId: number }
  | { action: "already_running"; runId: number }
> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.stripeReconciliationRuns.findFirst({
      where: eq(stripeReconciliationRuns.runKey, runKey),
    });

    if (existing?.status === "completed" || existing?.status === "completed_with_mismatches") {
      return { action: "already_complete", runId: existing.id };
    }

    if (existing?.status === "running") {
      return { action: "already_running", runId: existing.id };
    }

    if (existing) {
      await tx.update(stripeReconciliationRuns)
        .set({ status: "running", startedAt: new Date(), errorCode: null, errorMessage: null })
        .where(eq(stripeReconciliationRuns.id, existing.id));
      return { action: "claimed", runId: existing.id };
    }

    try {
      const inserted = await tx.insert(stripeReconciliationRuns).values({
        runKey,
        windowStartUtc: windowStartUtc,
        windowEndUtc: windowEndUtc,
        status: "running",
        startedAt: new Date(),
      });
      return {
        action: "claimed",
        runId: Number((inserted as unknown as [{ insertId: number }])[0].insertId),
      };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const winner = await tx.query.stripeReconciliationRuns.findFirst({
        where: eq(stripeReconciliationRuns.runKey, runKey),
      });
      if (!winner) throw new Error("reconciliation_run_claim_lost_without_row");
      return winner.status === "running"
        ? { action: "already_running", runId: winner.id }
        : { action: "already_complete", runId: winner.id };
    }
  });
}
```

A stale `running` row should be recovered only with an explicit lease/heartbeat policy. Do not let two jobs reconcile and resolve the same payout simultaneously.

## 7. Reconciling one payout

```ts
async function reconcilePayout(runId: number, payout: Stripe.Payout) {
  if (payout.reconciliation_status === "in_progress") {
    await recordMismatch({
      runId,
      stripePayoutId: payout.id,
      severity: "warning",
      mismatchType: "payout_not_reconciled",
      providerAmountCents: payout.amount,
      internalAmountCents: null,
      deltaCents: null,
      currency: payout.currency,
      evidence: { status: payout.status, reconciliationStatus: payout.reconciliation_status },
    });
    return { mismatchCount: 1 };
  }

  const transactions = await listPayoutBalanceTransactions(payout.id);
  const providerNetCents = transactions.reduce((sum, tx) => sum + tx.net, 0);

  if (providerNetCents !== payout.amount) {
    await recordMismatch({
      runId,
      stripePayoutId: payout.id,
      severity: "critical",
      mismatchType: "provider_payout_total_mismatch",
      providerAmountCents: payout.amount,
      internalAmountCents: providerNetCents,
      deltaCents: providerNetCents - payout.amount,
      currency: payout.currency,
      evidence: { transactionIds: transactions.map((tx) => tx.id) },
    });
    return { mismatchCount: 1 };
  }

  const snapshotId = await savePayoutSnapshot(runId, payout);
  await saveTransactionSnapshots(snapshotId, transactions);

  const mapped = await reconcileMappedTransactions(runId, payout, transactions);
  return { mismatchCount: mapped.mismatchCount };
}
```

A provider payout total mismatch is a Stripe/API data-integrity issue and should be critical. Do not attempt to correct it by adjusting internal ledger rows.

## 8. Mapping Stripe transactions to internal records

```ts
async function reconcileMappedTransactions(
  runId: number,
  payout: Stripe.Payout,
  transactions: Stripe.BalanceTransaction[],
) {
  let mismatchCount = 0;

  for (const transaction of transactions) {
    const sourceId = typeof transaction.source === "string"
      ? transaction.source
      : transaction.source?.id;

    const payment = sourceId
      ? await findPaymentByProviderReference(sourceId)
      : null;

    if (!payment) {
      // Exclude known Stripe-only transaction categories only if the business
      // has explicitly documented them, such as the payout transaction itself.
      if (transaction.type !== "payout" && transaction.type !== "stripe_fee") {
        await recordMismatch({
          runId,
          stripePayoutId: payout.id,
          severity: "high",
          mismatchType: "unmapped_stripe_transaction",
          providerAmountCents: transaction.net,
          internalAmountCents: null,
          deltaCents: transaction.net,
          currency: transaction.currency,
          evidence: {
            balanceTransactionId: transaction.id,
            type: transaction.type,
            sourceId,
          },
        });
        mismatchCount += 1;
      }
      continue;
    }

    const allocation = await loadPaymentAllocation(payment.id);
    if (!allocation) {
      await recordMismatch({
        runId,
        stripePayoutId: payout.id,
        paymentId: payment.id,
        severity: "critical",
        mismatchType: "allocation_mismatch",
        providerAmountCents: transaction.net,
        internalAmountCents: null,
        deltaCents: transaction.net,
        currency: transaction.currency,
        evidence: { balanceTransactionId: transaction.id, sourceId },
      });
      mismatchCount += 1;
      continue;
    }

    const expected = await calculateExpectedNetImpact(allocation);
    if (expected.netCents !== transaction.net || expected.currency !== transaction.currency) {
      await recordMismatch({
        runId,
        stripePayoutId: payout.id,
        paymentId: payment.id,
        subInvoiceId: allocation.subInvoiceId,
        severity: "critical",
        mismatchType: "allocation_mismatch",
        providerAmountCents: transaction.net,
        internalAmountCents: expected.netCents,
        deltaCents: transaction.net - expected.netCents,
        currency: transaction.currency,
        evidence: {
          balanceTransactionId: transaction.id,
          paymentId: payment.id,
          allocationId: allocation.id,
          expected,
        },
      });
      mismatchCount += 1;
    }
  }

  return { mismatchCount };
}
```

Do not compare the Stripe payout amount directly to the parent order’s grand total. A payout may contain multiple orders, fees, refunds, transfers, and other balance activity.

## 9. Alerting policy

### Critical alert

Send immediately when:

- Provider payout total does not equal its balance transactions.
- A Stripe transaction maps to no payment or allocation.
- An allocation’s distributor or amount does not match.
- A payout/refund transaction has a duplicate provider reference.
- A financial reconciliation run fails repeatedly.

### High alert

Send during business hours when:

- A payout remains `in_progress` beyond the expected window.
- Internal expected net differs from Stripe net.
- A payout has unmapped transactions that are not explicitly excluded.
- The daily job has not completed by the SLA.

### Warning

Send when:

- A reconciliation run completes with only documented, nonfinancial exceptions.
- A payout is pending and will be checked again in the rolling lookback.

Every mismatch alert should include:

```text
Run ID
Stripe payout ID
Balance transaction ID, if applicable
Internal payment ID
Sub-invoice and distributor
Provider amount
Internal expected amount
Delta
Currency
Mismatch type
First seen and last seen
Recommended action
```

## 10. Scheduler options

Because this job belongs to the CabinetDealz backend, use **application-native scheduling** rather than a generic agent schedule.

### Option A — Managed application cron

```text
03:30 America/Chicago every day
→ invoke runDailyStripeReconciliation()
```

This is preferred if the WebDev deployment supports a durable scheduled job runner.

### Option B — External scheduler calling a protected endpoint

```http
POST /internal/jobs/stripe-reconciliation
Authorization: Bearer <job-secret>
Idempotency-Key: stripe-reconciliation:2026-10-09
```

The endpoint should:

- Authenticate the scheduler
- Claim the deterministic run key
- Return `202` after enqueuing the job
- Never execute a long Stripe reconciliation inside a request timeout

### Option C — Queue worker scheduler

A persistent worker enqueues one daily job using a durable queue. This is appropriate for larger volume or multiple Stripe accounts.

Do not use an unmonitored sandbox process as the production scheduler.

## 11. Retry behavior

### Stripe API failures

Retry:

- Network timeout
- HTTP 429
- HTTP 500/502/503/504
- Temporary Stripe service errors

Do not retry indefinitely:

- Invalid API key
- Permission error
- Invalid payout ID
- Invalid request parameters
- Schema/decoding errors

Use exponential backoff with jitter and record the final failure on `stripe_reconciliation_runs`.

### Daily run failure

If a run fails:

1. Leave the run row as `failed` with error code and message.
2. Alert the operator.
3. Allow the next day’s rolling lookback to retry the window.
4. Permit an administrator to re-run the exact `run_key` after fixing the cause.
5. Do not mark a failed run complete.

## 12. Safety rules

- This is a **read-and-flag** job by default.
- It must not automatically transfer money, issue refunds, alter invoice totals, or rewrite payout records.
- It must not automatically “fix” mismatches by adding adjustment rows.
- All corrections require a separate reconciliation case and approval workflow.
- Store provider payload hashes and retrieval timestamps.
- Use integer cents and explicit currency checks.
- Keep Stripe test and live mode completely separate.
- Do not expose `STRIPE_SECRET_KEY` in logs or job payloads.

## 13. Daily report example

```text
Stripe payout reconciliation — 2026-10-09

Run: stripe-payout-reconciliation:2026-10-09
Status: completed_with_mismatches
Window: 2026-10-02 through 2026-10-10 UTC
Payouts reviewed: 4
Completed payouts: 3
Pending/in-progress payouts: 1
Stripe balance transactions: 118
Mapped transactions: 114
Unmapped transactions: 2
Critical mismatches: 1
High mismatches: 1
Warnings: 1

Critical:
- Payout po_001 / transaction txn_042
- Distributor sub-invoice CD-20261008-7F3KQ-A
- Provider net: $2,850.50
- Internal expected net: $2,870.50
- Delta: -$20.00
- Case: REC-2026-0042

Next action:
- Freeze payout settlement for the affected case.
- Verify provider transfer and post an append-only adjustment only after approval.
```

## 14. Verification tests

Before enabling the schedule, test:

1. Two scheduler invocations with the same run key create one run.
2. A payout with many balance transactions paginates completely.
3. Stripe `in_progress` payout creates a warning and is retried later.
4. Provider payout total mismatch creates a critical flag.
5. An unmapped transaction creates a high mismatch without guessed attribution.
6. A payment allocation mismatch identifies the correct distributor sub-invoice.
7. A transient Stripe timeout retries and eventually succeeds.
8. A permanent authentication error fails the run and alerts.
9. A completed run is not rerun automatically as a duplicate.
10. A failed run can be manually rerun with audit information.
11. A rolling seven-day lookback does not create duplicate snapshots.
12. The job never changes payments, invoices, refunds, payouts, or commissions.

## 15. Connector and deployment note

The current project-session configuration shows Stripe and Stripe API connectors available but **disabled**. Actual unattended Stripe reconciliation requires one of:

- Enable and authorize the project’s Stripe API connector, or
- Use the application’s already-configured server-side Stripe credentials and deploy the application-native job with a protected runtime secret.

No connector was enabled and no recurring job was created during this design step.
