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
`drizzle/0229_affiliate_outbound_sender.sql`:

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

`server/routers/affiliateSender.test.ts` and
`server/lib/crmOutboundAffiliate.test.ts` run with nodemailer stubbed and an
in-memory database: no SMTP server, no database, no mailbox is contacted.
