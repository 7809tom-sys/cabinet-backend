# Affiliate Fee Stack Collection and Vendor Payout Workflow

**Project:** Cabinet Dealz  
**Date:** September 24, 2026  
**Status:** Implementation plan only — no payment behavior is changed by this document.

## Executive decision

Cabinet Dealz should operate the order rail as a **controlled settlement workflow**, not as a single customer charge that immediately authorizes fulfillment. The platform must preserve three different money views for every order:

1. The **customer payment** is the customer-facing merchandise amount, verified shipping, sales tax, and any separately accepted customer labor line.
2. The **vendor payable** is the supplier’s verified invoice for product and supplier freight.
3. The **affiliate settlement** records the affiliate’s actual cost, Cabinet Dealz fees, shipping allocation, card-processing treatment, and the amount ultimately payable to or collectible from the affiliate.

These values must never be inferred from one another. In particular, a customer shipping charge is not automatically the vendor’s freight cost, a vendor invoice is not automatically a customer price change, and the affiliate-only fee stack must not be quietly added to a consumer checkout.

> **Target principle:** A paid customer order, a paid vendor invoice, and an affiliate payout are related financial events. They are not the same event and must each have their own approval, evidence, amount snapshot, and status.

## Required commercial decision before implementation

The owner should approve one written settlement rule before any live money movement is enabled. The phrase “Cabinet Dealz charges the affiliate” and the statement that “the affiliate gets paid after the order is received” can both be correct, but the accounting treatment must be explicit.

The recommended rule is to calculate an **affiliate settlement statement** after the customer payment and vendor invoice are final. It should show customer funds received, the vendor amount due, and the affiliate-only charges. The resulting balance can be either a payout to the affiliate or an amount the affiliate owes Cabinet Dealz. The platform must show the formula and the signed source amounts before any transfer is released.

The owner must select one of these policy treatments for the 5% Cabinet Dealz amount:

| Policy choice | Accounting effect | What must be approved |
|---|---|---|
| **Platform fee withheld from affiliate proceeds** | The 5% is retained by Cabinet Dealz from the affiliate settlement. | The customer-to-affiliate proceeds formula and payout statement language. |
| **Separate affiliate invoice** | Cabinet Dealz invoices or debits the affiliate independently for the 5% and other affiliate fees. | The collection method, due date, and non-payment policy. |

Until this policy is selected, the platform can calculate and review the fee statement but must not auto-debit an affiliate or release a net payout.

## Target order and settlement state machine

The current order rail should be extended rather than replaced. The target sequence is below. Every forward transition must be recorded with actor, UTC timestamp, source evidence, and an immutable financial snapshot version.

| Stage | Responsible party | Required record | Permitted result |
|---|---|---|---|
| `customer_submitted` | Customer | Priced order, delivery choice, verified carrier quote where shipment is selected | Creates an order intent; no vendor or affiliate money movement. |
| `affiliate_review` | Originating affiliate | Affiliate approval | Releases the order for vendor inventory review. |
| `vendor_inventory_check` | Vendor | Inventory response and invoice reference | Vendor may confirm inventory or decline/revise the order. |
| `affiliate_invoice_review` | Affiliate | Reviewed vendor invoice and final approval | Locks the commercial snapshot for customer payment. |
| `awaiting_customer_payment` | Customer | Final customer payment request | Customer receives a final, itemized Stripe Checkout link. |
| `customer_paid` | Stripe webhook | Verified paid PaymentIntent and Stripe fee snapshot | Creates eligible vendor-payable and affiliate-settlement records; does not itself move product. |
| `vendor_payment_ready` | Finance/admin | Vendor invoice, approved payable, payee verification | Allows a controlled vendor disbursement. |
| `vendor_paid` | Finance system or admin | Transfer/check/ACH reference and amount | Allows fulfillment authorization. |
| `fulfillment_authorized` | Cabinet Dealz | Paid vendor payable and customer payment | Vendor may begin fulfillment. |
| `shipped` / `delivered` | Vendor or carrier | Tracking or delivery evidence | Starts the affiliate payout hold/review process. |
| `received_confirmed` | Customer, affiliate, or defined delivery timeout | Receipt evidence or approved exception | Makes the affiliate settlement eligible for payout. |
| `affiliate_payout_ready` | Finance/admin | Reconciled settlement and payee status | Allows the affiliate payout or closes a separate affiliate receivable. |
| `affiliate_paid` / `affiliate_collected` | Payment system or finance/admin | Transfer, ACH, check, or Stripe reference | Closes the order settlement, subject to refund/dispute reserves. |

A vendor invoice change after `affiliate_invoice_review` must invalidate the current financial snapshot. If the customer has not paid, Cabinet Dealz generates a revised customer checkout request only when the customer-facing total has changed. If the customer has paid, the system must require an explicit adjustment, supplemental collection, credit, or refund decision. It must never silently substitute a new vendor amount or ship against an unapproved loss.

## Fee-stack specification

The following calculation should be implemented in a single tested server-side module and stored as an immutable settlement snapshot. All money uses integer cents. The fee basis excludes tax, customer labor, customer shipping markup, and any unverified value.

| Settlement component | Source of truth | Formula | Notes |
|---|---|---|---|
| Vendor merchandise cost | Verified vendor invoice lines | Exact approved amount | Must retain vendor invoice reference and supporting document link. |
| Vendor freight cost | Verified vendor invoice or documented carrier/vendor charge | Exact approved amount | Separate from the customer shipping line. |
| Cabinet Dealz markup | Approved fee policy | 5% × approved affiliate cabinet-cost basis | The owner must approve whether this is withheld or billed separately. |
| Damage allowance | Approved fee policy | 1% × approved affiliate cabinet-cost basis | Must be shown as an affiliate-only line. |
| Technology/AIP fee | Approved fee policy | `min(10% × approved affiliate cabinet-cost basis, $100.00)` | Store both calculated amount and cap application. |
| Card-processing fee | Stripe balance transaction or approved disclosed schedule | Actual Stripe fee after payment, or an owner-approved fixed disclosed fee | Do not use the existing 4% default in production until the owner approves it as policy. |
| Customer shipping | Signed carrier quote | Exact verified customer freight amount | Customer-facing line only. |
| Customer tax | Server tax calculation | Exact tax snapshot | Never becomes part of the affiliate fee base. |
| Customer labor | Approved labor estimate | Exact selected labor amount | Separate customer-facing service line; excluded from vendor cabinet cost and affiliate fee basis unless a later written policy says otherwise. |

The settlement statement should display all source values, the fee policy version, and the formula values used. A zero-dollar amount must be labeled as a verified free/waived amount only when its source supports that conclusion. Otherwise, it must be displayed as incomplete and blocked from payment or payout.

## Data model and audit ledger

The existing `order_requests` row should remain the customer-order record. It should not become the sole accounting ledger. The implementation should add dedicated tables with immutable amount snapshots and explicit state transitions.

| Table | Core fields | Purpose |
|---|---|---|
| `order_financial_snapshots` | `orderRequestId`, version, currency, customer merchandise/freight/tax/labor cents, vendor merchandise/freight cents, fee-policy version, status, created/approved timestamps | Captures the complete approved monetary basis at each commercial revision. |
| `vendor_invoices` | `orderRequestId`, distributorId, reference, currency, merchandise/freight/total cents, invoice document storage key/URL, notes, submitted/verified timestamps | Stores vendor evidence separately from the customer order. Uploaded files remain in object storage, not database blobs. |
| `vendor_payables` | `orderRequestId`, `vendorInvoiceId`, amount cents, method, state, provider transfer ID or external reference, approved/paid/reversed timestamps | Records exactly what Cabinet Dealz owes and pays the vendor. |
| `affiliate_settlements` | `orderRequestId`, snapshot ID, affiliate ID, gross customer funds, vendor payable, each fee component, net payable/receivable, state, payment reference | Produces the reviewable affiliate statement and controls payout or collection. |
| `payment_events` | provider, event ID, object ID, event type, payload hash, processed timestamp, outcome | Makes Stripe webhooks idempotent and auditable without storing raw sensitive payloads. |
| `order_fulfillment_events` | order ID, event type, actor, carrier/tracking reference, evidence link, occurred timestamp | Supports shipped, delivered, received, exception, and return states. |
| `settlement_adjustments` | settlement ID, reason, debit/credit cents, approver, linked refund/dispute/credit note | Prevents silent edits after payment, vendor payment, or payout. |

The schema should add foreign keys and unique constraints for one active financial snapshot per stage, one vendor payable per approved vendor invoice, and provider-event idempotency. Financial rows should be append-only after approval. Corrections use a new snapshot or a linked adjustment, never an overwrite of historical money.

## Payment and payout architecture

### Customer collection

The customer should receive Stripe Checkout only after the vendor invoice has been reviewed and the affiliate has approved the commercial snapshot. The server, not the browser, creates the Checkout Session from that locked snapshot. The Stripe webhook remains the only authority that changes `customer_paid` status.

The Checkout request should include an `order_id`, financial snapshot ID, snapshot version, and a stable transfer group in Stripe metadata. It must preserve the current safeguards for a verified freight quote and prevent a customer from paying an expired or superseded snapshot.

### Vendor payout

The first production release should support a **manual, evidence-backed vendor payable**. Finance staff select an approved vendor payable, record an ACH/check/wire reference or external payment processor reference, and attach supporting evidence. This avoids pretending that an automated vendor payment exists before each vendor’s payment arrangement and compliance status are known.

The second release can add Stripe Connect for vendors who are eligible and expressly enrolled. For the intended model, Stripe’s separate-charges-and-transfers pattern is the closest fit because the customer charge stays on Cabinet Dealz’s platform account and the platform can later create transfers to multiple connected accounts. The platform remains responsible for Stripe fees, refunds, and chargebacks under that model.[1]

Each automated transfer must use an idempotency key derived from the payable ID, persist Stripe’s transfer ID and balance-transaction ID, and include the order’s transfer group. A transfer must never be created merely because a UI button was clicked twice or a webhook was replayed.

### Affiliate payout

Affiliate payout release must wait for `received_confirmed` or an owner-approved delivery timeout. The system should display a proposed settlement first. An authorized finance user then releases it as a manual payment or, for an enrolled affiliate, as a Stripe Connect transfer.

Stripe connected-account payouts have their own provider lifecycle, including pending, in-transit, paid, failed, and canceled states. Cabinet Dealz should reconcile those provider events into the affiliate settlement record rather than using a local “paid” flag as the sole proof of receipt.[2]

## Refunds, disputes, cancellations, and exceptions

The implementation must introduce a settlement hold and reversal policy before any automated transfers are enabled.

When a customer refund, dispute, or payment failure occurs before a vendor transfer, the vendor payable and affiliate settlement are automatically frozen. When it occurs after a transfer, the system creates an exception case. Finance can reverse a permitted connected-account transfer, offset a future transfer, or record a receivable. Stripe does not automatically reverse related transfers when a platform charge is refunded, so Cabinet Dealz must reconcile the linked transfer itself.[1]

The system must retain the original payment, refund, transfer, and settlement references. Stripe notes that original card-processing fees may not be returned on refunds, so the policy must state who bears that cost and show it as a separate adjustment rather than rewriting the original fee stack.[3]

A cancellation before customer payment closes the active snapshot. A cancellation after customer payment must use a formal refund or credit decision. A cancellation after vendor payment or shipment requires an exception workflow that records vendor credits, return freight, restocking fees, and any affiliate settlement adjustment.

## Permissions and controls

The following permissions are mandatory.

| Action | Authorized role | Required condition |
|---|---|---|
| Approve vendor invoice | Originating affiliate owner | Vendor invoice and current snapshot are present. |
| Submit vendor invoice | Authenticated vendor for that distributor | Order is routed to that distributor and is awaiting inventory review. |
| Create customer checkout | Server process | Snapshot is current, approved, priced, and has verified shipping if shipment is selected. |
| Mark external vendor payment | Finance admin | Vendor payable is approved; payment reference is supplied. |
| Release affiliate settlement | Finance admin | Delivery/receipt condition and payout verification are satisfied. |
| Create Stripe Connect transfer | Server process using finance-approved action | Payee is enrolled and verified; idempotency and balance checks pass. |
| Reverse/adjust settlement | Finance admin with reason | Linked refund, dispute, correction, or approved credit note exists. |

No vendor, affiliate, or ordinary customer may type an authoritative supplier cost, freight quote, payout amount, or card fee into a browser form. The user interface may collect documentation and propose values, but server-side validation must confirm source ownership, state, and currency.

## User interface work

The customer sees a final checkout summary only after the affiliate accepts the vendor invoice. The customer view includes merchandise, verified shipping, tax, and any selected labor line. It does not expose vendor cost or affiliate-only fees.

The affiliate order page shows the vendor invoice, the approval action, and a separate **Settlement** tab. The settlement tab shows customer funds, vendor cost, approved fee lines, the projected net outcome, delivery status, and the eventual payment reference. It clearly labels estimates versus final values.

The vendor portal adds an invoice upload/reference area, merchandise and freight amount fields, inventory outcome, and shipment/tracking updates. A vendor cannot mark an order fulfilled merely by entering an invoice.

The Admin Finance workspace adds queues for vendor invoices, vendor payables, affiliate settlements, refunds/disputes, unmatched Stripe events, and payout exceptions. It must show the source document, approval chain, provider references, and a single order-level ledger timeline.

## Delivery phases

### Phase 0 — policy and provider decisions

Approve the 5% treatment, the card-fee policy, the customer payment timing, the delivery/receipt definition, the vendor payment methods, the refund reserve policy, and which payees will use Stripe Connect. Do not enable live automated transfers in this phase.

### Phase 1 — accounting foundation and current-rail correction

Create the new snapshot, invoice, payable, settlement, fulfillment-event, and payment-event tables. Move customer Checkout creation to after affiliate vendor-invoice approval. Preserve existing customer order, verified freight, and CRM invoice behavior. Remove any route that can send an order to a vendor before the affiliate approval state.

### Phase 2 — vendor invoice, payable, and fulfillment controls

Implement vendor invoice evidence capture, finance review, manual vendor-payment recording, and fulfillment authorization only after customer payment and vendor payment conditions are met. Add shipment, delivery, and receipt events.

### Phase 3 — affiliate settlement and manual payout operations

Implement the exact fee-stack calculation, settlement statement, payout eligibility after receipt, manual payout references, adjustment notes, and the finance reconciliation queues. Retire the current model that treats every customer-paid order as immediately commission-eligible.

### Phase 4 — Stripe Connect automation

After Stripe Connect account onboarding, payout verification, provider review, and sandbox testing, add idempotent vendor and affiliate transfer creation. Subscribe to transfer and payout lifecycle events. Maintain a manual fallback for non-enrolled vendors and affiliates. The platform must never assume that a transfer is a completed bank payout; provider payout events determine final status.[2]

### Phase 5 — production rollout and reconciliation

Use test orders in Stripe test mode, then a limited live pilot with one vendor and one affiliate. Reconcile customer charge, Stripe fee, vendor payable, vendor payment, affiliate settlement, and affiliate payout for every pilot order. Enable broader rollout only after finance signs off on the daily reconciliation report and exception handling.

## Test and acceptance criteria

The release is ready for the next phase only when all relevant unit, integration, browser, and payment-provider tests pass.

| Area | Required evidence |
|---|---|
| Fee calculations | Tests cover 5%, 1%, 10% capped at $100, a verified zero shipping quote, separate vendor/customer freight, actual versus fixed card fee policy, rounding, and negative/invalid source values. |
| State transitions | Tests reject skipped steps, duplicate approvals, a vendor invoice from the wrong distributor, checkout from a superseded snapshot, and fulfillment before approved payment conditions. |
| Permissions | Tests prove that only the originating affiliate approves, only the correct vendor submits an invoice, and only finance can release payables or settlements. |
| Webhooks | Tests cover duplicate delivery, out-of-order events, failed payment, refund, dispute, failed payout, and retry without a duplicate transfer. |
| Reconciliation | A test report ties every order to customer payment, Stripe fee, vendor payable/payment, affiliate settlement, and affiliate payout or receivable. |
| User experience | Desktop, tablet, and phone views show a clear current state, disabled action reasoning, source references, and no unlabeled $0 or unverified financial line. |
| Production guardrails | Live transfers stay disabled until Stripe live credentials, webhooks, connected account onboarding, payout verification, and manual pilot reconciliation are complete. |

## Implementation order and file ownership

| Workstream | Primary files to change or add |
|---|---|
| Schema and migrations | `drizzle/schema.ts`, new Drizzle migration files, `drizzle/meta/_journal.json` |
| Money calculation | New `shared/orderSettlement.ts` with unit tests; retain `shared/pricing.ts` only for shared configurable fee policy inputs |
| Order rail | `server/routers/orders.ts`, new `server/routers/settlements.ts`, `server/stripe.ts`, `server/stripeWebhook.ts` |
| Vendor functions | `server/routers/distributorPortal.ts`, `client/src/pages/DistributorPortal.tsx` |
| Affiliate functions | `server/routers/affiliates.ts`, `client/src/pages/AffiliateDashboard.tsx` |
| Finance operations | New admin finance components plus `client/src/components/admin/IncomingOrdersAdmin.tsx` updates |
| Checkout | `client/src/components/order/OrderReview.tsx`, `client/src/components/order/PayWithStripe.tsx`, customer success/cancel pages |
| Regression coverage | New settlement, provider-webhook, state-transition, payout, and UI source-contract tests alongside existing order-rail tests |

## Basis and implementation assumptions

**Basis.** The plan uses the owner’s stated affiliate fee policy: vendor/affiliate cost plus a 5% Cabinet Dealz markup, 1% damage allowance, 10% technology/AIP fee capped at $100 per order, shipping, and a card-processing fee. Customer-facing merchandise, freight, tax, and optional labor remain separate from affiliate-only settlement lines.

**Time.** This plan reflects the Cabinet Dealz codebase and order-rail audit performed on September 24, 2026.

**Assumptions.** The plan assumes customer funds are processed by Cabinet Dealz through Stripe, vendors and affiliates may initially require manual payments, and automated Stripe Connect transfers are optional rather than assumed. The exact 5% treatment, card-fee method, delivery-confirmation rule, and payee enrollment model remain owner decisions before live implementation.

**Sources and confidence.** Existing Cabinet Dealz order, payout, and Stripe implementation files were reviewed for the current-state baseline. Stripe Connect and refund lifecycle recommendations are based on Stripe’s official documentation.[1] [2] [3]

**Compliance.** This is an implementation and accounting-control plan, not legal, tax, payments-compliance, or financial advice. Before live payments, Cabinet Dealz should obtain payment-provider, accounting, and legal confirmation of merchant-of-record responsibilities, escrow/holding requirements, chargeback treatment, and state-specific money-transmission obligations.

## References

[1]: https://docs.stripe.com/connect/separate-charges-and-transfers "Create separate charges and transfers"
[2]: https://docs.stripe.com/connect/payouts-connected-accounts "Payouts to connected accounts"
[3]: https://docs.stripe.com/refunds "Refund and cancel payments"
