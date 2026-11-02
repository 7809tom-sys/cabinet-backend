# Per-affiliate outbound email

Each affiliate (a contractor or distributor storefront, e.g. Rich's Building
Supply) is a separate business entity. When the affiliate contacts a customer —
quotes, invoices, design shares, follow-ups — the message must come FROM the
affiliate's own address, not from Cabinet Dealz.

This is customer mail only. It does not touch Supabase auth email, and it does
not change distributor purchase-order mail, which stays on the platform sender.

## Where settings live

Settings are on the affiliate's `affiliate_email_settings` row (one row per
affiliate, `affiliateId` is the key). Added by
`drizzle/0231_affiliate_outbound_sender.sql`:

> **Merge order:** this migration must land **after** cabinet-backend PR 73,
> which adds `0229_countertop_quote_affiliate` and
> `0230_affiliate_custom_domain` at journal `idx` 228 and 229. This file takes
> `idx` 230, so the journal keeps one increasing sequence and no migration
> number or `idx` collides. The two migrations touch different tables, so the
> SQL itself is order-independent.

| Column | Purpose |
| --- | --- |
| `contactEmail` | The affiliate's own customer-facing address. Also the default recipient of the test email. |
| `smtpHost`, `smtpPort`, `smtpSecure`, `smtpUser` | The mailbox. `smtpSecure` is stored rather than inferred from the port: 465 is implicit TLS, 587 is STARTTLS. |
| `smtpPass` | The app password, encrypted at rest with the existing `cabinetdealz:smtp:v1` AES-256-GCM envelope keyed by `JWT_SECRET`. Never returned to a client; the API exposes `hasPassword` and `configured` booleans only. |
| `enabled` | When off, customer mail keeps the Cabinet Dealz sender. |
| `invoiceCopyEmail` | Where Cabinet Dealz receives a copy of every invoice. Blank uses `CABINETDEALZ_ADMIN_EMAIL`. |
| `lastTestedAt`, `lastTestOk`, `lastTestError` | Result of the last test send. `lastTestError` holds the provider's exact text (no password). |

Yahoo reference values, as reported for the First Class mailbox:

```
host      smtp.mail.yahoo.com
port      465 (SSL)   or 587 (STARTTLS)
username  the full address, e.g. richnseliena@yahoo.com
password  a Yahoo app password (not the account password)
```

## Endpoints

All are under `crm.emailSetup` and the affiliate is resolved **server-side**:

- `get` — the caller's own store. A platform admin must pass `affiliateId`.
- `save` — same scoping. A blank `smtpPass` keeps the saved one. Enabling
  requires a host, username, and password.
- `sendTest` — verifies the saved connection and sends one test to the
  affiliate's own `contactEmail`. Returns `{ ok, from, to }` or
  `{ ok: false, error }` with the exact SMTP failure (e.g. `EAUTH: Invalid
  login: 535 5.7.8 ...`). The recipient is never client-supplied.
- `connections` — admin-only status list across stores; no passwords.

### Frontend contract aliases

The affiliate dashboard (cabinet-frontend PR 232) calls a different vocabulary:
`affiliateEmailSettings.get / update / sendTest`. These are aliases of the same
implementation — both routers delegate to
`server/lib/affiliateSenderSettings.ts`, so authorization and password handling
cannot drift between them. Field mapping:

| Dashboard | Stored column |
| --- | --- |
| `email` | `contactEmail` |
| `provider` | `provider` (`yahoo`/`gmail`/`outlook`/`custom`) |
| `smtpHost`, `smtpPort` | `smtpHost`, `smtpPort` |
| `secure` | `smtpSecure` |
| `username` | `smtpUser` |
| `appPassword` (write-only) | `smtpPass` (encrypted) |
| `hasAppPassword` | `smtpPass` non-empty |

`update` writes only those identity fields and preserves the CRM extras
(`fromName`, `replyTo`, `signatureHtml`, `invoiceCopyEmail`) from the existing
row, so a save from the simpler dashboard cannot erase them. `get` also returns
`configured`, `canEdit`, `lastTestedAt`, and `lastTestOk`. `sendTest` returns
`{ ok, to, error }`, with `to` empty on failure and `error` carrying the
provider's exact text. The dashboard's fixed invoice-copy note ("built into
invoicing and cannot be turned off") is accurate: the copy is always added and
the stored address defaults to the Cabinet Dealz admin address.

Scoping rules: a platform admin may act on any store but must name it by id. An
affiliate owner may act only on the store the server resolves for their login.
Team members cannot change the mailbox even with CRM access, because the app
password controls the store's outbound identity. A client-sent slug or a foreign
affiliate id is rejected with `FORBIDDEN`; nothing is ever read or written by
slug.

## Which sends use it

`server/lib/crmOutboundMail.ts` resolves one sender per affiliate deal:

1. The affiliate's own enabled, complete mailbox (`channel: "affiliate"`).
2. Otherwise the shared platform sender (`platform_fallback`), keeping the
   affiliate as reply-to.
3. House deals always use the platform sender (`platform`).

Customer paths that go through it: CRM composer sends and follow-ups
(`crm.sendEmail`), the branded invoice PDF (`crm.sendInvoiceEmail`), design
shares (`crm.sendDesign`), and the paid-order receipt
(`server/lib/orderReceiptEmail.ts`). Supplier/distributor purchase-order mail
passes `platformSender: true` and never uses an affiliate mailbox.

Every invoice send also adds a BCC to the invoice-copy address, on both the
affiliate and the platform path. Quotes, design links, and follow-ups do not.

If the affiliate mailbox rejects the message, the send fails with the provider's
error — it does not silently re-send as Cabinet Dealz.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | yes (already set) | Encrypts/decrypts the stored SMTP app password. Changing it invalidates saved passwords. |
| `CABINETDEALZ_ADMIN_EMAIL` | recommended | Default recipient of the invoice copy. Falls back to `ORDER_NOTIFY_EMAIL`. |
| `ORDER_NOTIFY_EMAIL` | optional | Existing sales address; second fallback for the invoice copy. |

`RESEND_API_KEY` / `ORDER_EMAIL_FROM` are still needed for house mail and for
any store that has not configured its own mailbox.

## Verification

`server/routers/affiliateSender.test.ts`,
`server/lib/crmOutboundAffiliate.test.ts`, and
`server/routers/affiliateEmailSettingsContract.test.ts` run with nodemailer
stubbed and an in-memory database: no SMTP server, no database, no mailbox is
contacted.
