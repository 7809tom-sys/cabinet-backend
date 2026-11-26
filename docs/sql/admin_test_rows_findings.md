# Admin test rows: what is in each tab, and which SQL to run

This file is a review. Nothing in it has been run against production, and nothing here should be merged as a data change.

Live admin UI: [cabinet-frontend](https://github.com/7809tom-sys/cabinet-frontend) (`client/src/components/admin/AdminGroupedTabs.tsx`).
API and tables: this repo. Database: TiDB Cloud, schema `cabinet_dealz`.

## Live row counts

The live database was not queried. Railway project `innovative-encouragement`, service `cabinet-backend` (production), has `DATABASE_URL`, but the connected Railway app returns variable names only, not values. The other Railway service named cabinet-backend (`believable-endurance`) has no `DATABASE_URL`. There is no `DATABASE_URL` in this environment.

To get counts, open the TiDB Cloud SQL editor on the cluster whose prefix is recorded in `docs/sql/order-verified-columns-create.sql` (`4GBFngYGckRNTBc`), select schema `cabinet_dealz`, and paste **Part 0 and Part 1** of `docs/sql/review_admin_test_rows.tidb.sql` one statement at a time. Those statements only read.

What is already known without a query: the Countertop Quotes card in the Oct 20 screenshot says `Fabrication shop list not set up yet (docs/sql/0291).` That string is `CountertopQuoteFabPanel.tsx` when the fabrication-shop tables are missing. So `docs/sql/0291_fabrication_shops_countertop_zip.tidb.sql` is not applied. The quotes themselves are stored: the same card lists `buyer@example.com`, 32.5 sq ft, 18.0 lin ft, island, ZIP 75201, status New, no saved design. That payload is written by `server/design.countertop.test.ts` and the test never deletes the row.

## What counts as a test row

Deleted only when one of these is true:

- Email domain is one `server/crmCleanup/plan.ts` already treats as fake (`example.com`, `example.org`, `example.net`, `example.invalid`, `test.com`, `mailinator.com`, `guerrillamail.com`, `yopmail.com`, `tempmail.com`, `trashmail.com`, `10minutemail.com`, `sharklasers.com`, `discard.email`, `fakeinbox.com`, `mailnull.com`), plus `example.edu` and `cabinetdealz.test`, or the address ends in `.test`, `.invalid`, `.example`, or `.localhost`.
- Countertop quote `notes` is exactly `vitest countertop request`.
- Order `requestNumber` starts with `VF-TEST-`, `E2E-CRM-`, or `DELETE-`, or is exactly `TEST-CUSTOMER-1` or `TEST-CONTRACTOR-1`, or `stripePaymentIntentId` starts with `pi_synthetic_`.

Kept even when they look odd:

- Real domains (`gmail.com`, `cabinetdealz.com`, and anything not in the list above).
- A test-looking order that a non-test CRM deal still points at, or that a live Stripe charge (`livemode = 1`, `stripeMode = live`, customer email not a test domain) still points at.
- A CRM deal with a sales commission marked `paid`.
- Live-mode Stripe rows.
- Payments on an order this script is not deleting.
- Users, affiliates, saved designs, fabrication shops, the catalog, and cabinet-shop prospect rows (`cabinet_shop_list_` in the notes).
- A name that merely contains "test" or "sample". Admin → CRM Cleanup flags those. This script does not.

`test.com` is in the CRM planner's fake-domain list. It is also a domain a real person could use. Part 1 prints the address before any delete.

## Per tab

| Admin tab | Table the screen reads | Test rows this script targets | Left alone |
|---|---|---|---|
| Incoming Orders | `order_requests` (`orderKind` standard or mixed) | Test email, `VF-TEST-` / `E2E-CRM-` / `DELETE-` / `TEST-CUSTOMER-1` / `TEST-CONTRACTOR-1`, or `pi_synthetic_` | Real customers. Sample-kind rows stay unless they match those markers. |
| Master Orders | Same `order_requests` list (`orders.adminListWithPoSkus`) | Same rows as Incoming Orders | Same |
| Sample Orders | `order_requests` where `orderKind = 'sample'` | Only sample orders that also match the markers above | Real sample orders |
| Sales Forecast | Computed from deals and orders, plus `sales_forecast_close_brackets` | None directly. A removed test order disappears from the forecast. | Bracket settings |
| Vendor Updates | `vendor_admin_updates`, vendor price-increase inbox | None. These are supplier messages, not customer signups. | All of them |
| Vendor Inventory | Distributor on-hand quantities | None. Catalog stock, not test customers. | All of them |
| Sales CRM | `crm_deals`, plus `crm_activities`, `crm_deal_designs`, `crm_email_log`, `crm_deal_files` | Test-domain `contactEmail`, and only when no commission is `paid` | Real contacts, paid-commission deals, cabinet-shop prospects |
| Designer Helper Requests | `designer_helper_requests` (frontend `docs/sql/0257`, not in this repo) | Commented preview at the bottom of the script. Skip it if Part 0 says the table is missing. | Designer queue rows (`designer_helper_queue`) |
| Consultations | `design_consultations` | Test-domain `customerEmail` | Real bookings. Availability slots are not customer rows. |
| Design Leads | `design_leads` | Test-domain `email` | Real launches |
| Countertop Quotes | `countertop_quotes` | Test-domain email, or note `vitest countertop request`. The screenshot rows are in this set. | Real quote requests |
| Fabrication Shops | `fabrication_shops` | None. The tab is empty until 0291. Those 573 Florida shops are a real prospect list. | The whole shop list |
| Payments | `payments` | Only rows whose order is itself being deleted | Test payer emails on a kept order (listed, not deleted) |
| Stripe Invoices | `stripe_payment_records` | `stripeMode = 'test'` and a test-domain customer email | Live mode, and test mode with a real-looking email |
| Customers | `users` | Listed only | Not deleted. Do not use "purge test members" (that deletes every non-admin). |
| CRM Cleanup | Planner over users, orders, deals, designs | Separate tool. It also flags fake names and can delete users. Do not run it in the same sitting as this script. | Named staff (Tom, Seliena, Rich, Marcus, Ron, M 2) |
| Pro Applications | `pro_applications` | Test-domain email | Real applicants |
| Vendors | `vendor_applications` | Test-domain email | Real applicants |
| Vendor Referrals | `vendor_referrals` | Test-domain email | Real referrals |
| Contractor Access | `contractor_access_requests` | Test-domain `contractorEmail` | Real requests |
| Sales Reps | `sales_rep_applications` (frontend careers SQL) | Not in this script. Preview that table by hand if it contains `@example.com`. | Real applications |
| Affiliate Invoices, Payouts, Sales Commissions | `affiliate_invoices`, `affiliate_payouts`, `sales_commissions` | Unpaid commissions are removed only as children of a test deal that is being removed | Paid commissions and real affiliate billing |
| Catalog, pricing, shipping, settings | Catalog and settings tables | None | All of them |

Child rows removed with a test order: `payments`, `order_shipments`, `order_request_line_costs`, `order_request_commerce_snapshots`.
Child rows removed with a test deal: activities, design links, email log, files, and commissions that are not `paid`.

## Code that writes test rows

These run only when `DATABASE_URL` points at a database. Vitest does not mock that connection. A test run against production inserts real rows.

- `server/design.countertop.test.ts` inserts `buyer@example.com`, 32.5 / 18, island, ZIP 75201, note `vitest countertop request`, and does not delete it. This matches the screenshot. `requestCountertopQuote` in `server/routers/design.ts` is the public endpoint that stores it.
- `server/vendorFulfillment.test.ts` inserts `VF-TEST-<timestamp>` orders with `pi_synthetic_vf_test` and originator emails at `example.invalid`. `afterAll` deletes them. A crashed run can leave the row.
- `server/crm.orderAddress.test.ts` inserts `E2E-CRM-<timestamp>` and `playwright-crm@example.com`, then deletes them in `finally`.
- `server/design.ownerScope.test.ts` inserts `DELETE-<timestamp>` orders and `customer@example.test`. `finally` deletes them. A crash leaves the order, and the order has no originator email, so the `DELETE-` prefix is what this script matches.
- `server/lib/loginTestAccount.ts` runs only when `ENABLE_TEST_ACCOUNTS` is exactly `true`. Signing in as `customer` or `contractor` with password `test` creates `customer@cabinetdealz.test` / `contractor@cabinetdealz.test`, orders `TEST-CUSTOMER-1` and `TEST-CONTRACTOR-1`, designs named `Sample customer kitchen` and `Sample contractor kitchen`, and a contractor folder `homeowner@cabinetdealz.test`. The script deletes the orders, deals, and contractor folder. It does not delete the user or the design. Part 1 lists both.

Do not run:

- `server/routers/customers.ts` `purgeTestMembers`. It deletes every user whose role is not `admin`, plus their carts and kitchen designs.
- `server/cleanup_test_data.mjs`. It deletes users whose `loginMethod` is null.

## SQL Tom should run now

How, for every file: TiDB Cloud SQL editor, schema `cabinet_dealz`, one statement at a time. "Duplicate column" or "table already exists" on a file that says that error is safe means the statement already landed. Skip that statement and paste the next. Do not run these from Railway or from the app. Nothing in this repo applies `docs/sql` on startup.

**Run now, read-only:** Part 0 and Part 1 of `review_admin_test_rows.tidb.sql`. Part 0 answers which later files are missing. Part 1 is the preview for each delete.

**Run now, to fix the Fabrication Shops message:** `0291_fabrication_shops_countertop_zip.tidb.sql`. Confirmed missing by the live quote card. It only adds `fabrication_shops` and `countertop_quote_fab_shops`, then inserts 573 real Florida shops. It does not delete quotes. Paste blocks 1 through 9 in order. Safe to run twice (`IF NOT EXISTS` / duplicate shop skip). Do this separately from the test-row deletes. Deleting the `buyer@example.com` quotes does not require 0291.

**Do not run now:** Part 2 of the review script. It ends in `ROLLBACK` and must not be pasted into the SQL editor, because that editor commits each statement. Change `ROLLBACK` to `COMMIT` only after Part 1 has been read and the rows look like the test cases above. Do not merge this pull request to apply it.

**Check with Part 0, then run only the rows that come back `present = 0`:**

| File | What it does | If Part 0 says missing |
|---|---|---|
| `0246_order_verified_email.tidb.sql` | Adds `order_requests.orderVerifiedEmailSentAt` so the verified-order email is sent once. | Run it. Add-only. Orders still verify without it, but the email is not marked. |
| `0247_order_pallet_photo.tidb.sql` | Adds pallet photo columns on `order_requests`. | Run it before anyone uploads a pallet photo. Add-only. |
| `0254_kitchen_rule_settings.tidb.sql` | Creates `kitchen_rule_settings`. | Run it if Kitchen Rules should save. Plain `CREATE TABLE`; "already exists" is safe. |
| `0255_library_internal_documents.tidb.sql` | Adds `affiliate_literature.visibility` and registers internal library docs. | Run it if the library toggle errors. Requires the earlier library table. |
| `0271_affiliate_storefront_name_claim.tidb.sql` | Creates `affiliate_storefront_claims`. | Run it if publishing a storefront says it is not set up. |
| `0272_affiliate_legal_esign.tidb.sql` | Creates the affiliate contract and signature tables. | Run it before legal e-sign is used. |
| `0280_door_color_source.tidb.sql` | Adds door color-source columns. No backfill. | Run it before relying on the color-of-record field. |
| `0281_affiliate_catalog_sale_overrides.tidb.sql` | Affiliate sale price columns and `hardware_category_affiliate_markups`. | Run it before affiliate Pelican/hardware sale prices are edited. |
| `0284_crm_design_saved_stamps.tidb.sql` | Adds `crm_deals.firstDesignSavedAt` and `lastDesignSavedAt`. Block 8 backfills those two columns only. | Run blocks 4 and 5 so CRM stamps start. Block 8 is optional and only fills the new columns. |
| `0285_backup_runs.tidb.sql` | Creates `backup_runs` and `backup_settings`. | Run it if the Backups tab says it needs a database update. |
| `0286_crm_customer_import_outreach.tidb.sql` | Seven outreach tables. One settings row, outreach off. | Run it if the Outreach tab says to run 0286. It does not email anyone until outreach is turned on. |
| `0287_warehouses_open_closed.tidb.sql` | Creates `warehouses` and inserts Woodland Sacramento as closed. | Run it so a warehouse can be closed without being deleted. Until then every warehouse is treated as open. |
| `0288_designer_subscriptions.tidb.sql` | Creates `designer_subscriptions` for the $1,199 and $1,599 yearly plans. | Run it so a paid designer plan is stored. Checkout still opens without it; the webhook skips the row. |

The older files in `docs/sql` (0222 through 0270, including the four different files numbered 0269) are the same kind of hand paste. They add columns, indexes, or small settings rows for features that have been deployed for a while. Part 0 does not restate every one of them. If a screen errors with "unknown column" or "table doesn't exist", run the file named in that error, one statement at a time. Do not re-run a file that `DROP`s a column (`0236_drop_door_swatch_fields.tidb.sql`, `0239_affiliate_site_scope.tidb.sql`) unless that exact change is still wanted.

`order-verified-column-check.sql` is read-only. `order-verified-columns-create.sql` repeats 0224, 0227, 0246, and 0247. Skip it when Part 0 already shows 0246 and 0247 present.

## Frontend `docs/sql` (not in this repo)

The live admin also depends on SQL that lives only in cabinet-frontend. Same paste method.

| File | Recommendation |
|---|---|
| `0257_designer_helper_queue.tidb.sql` | Run it if Designer Helper Requests errors because the table is missing. Part 0 checks `designer_helper_requests`. Plain `CREATE TABLE`; "already exists" is safe to skip. No `IF NOT EXISTS`. |
| `0290_crm_cabinet_shops_fl.tidb.sql` | Not applied, by its own header. Inserts 928 real Florida cabinet shops into Sales CRM. Not test data, and not required to clear the quote tab. Run it only when those prospects should show under CRM → Cabinet Shops. Do not run it in the same sitting as the test-row delete. |
| `0281_demo_distributor_storefront.tidb.sql` | Do not run. The file says it is superseded. It would insert an `example.com` demo affiliate. |
| `0283_damage_claims.tidb.sql` and the other frontend-only numbered files | Schema for designer, catalog, and order features shipped from that repo. Run a file when the screen that names it is broken. They are not the test-quote cleanup. |
