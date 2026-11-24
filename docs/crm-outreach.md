# CRM customer list import + AI follow-up outreach

Admin only. House CRM only (affiliate contacts are never emailed by this).
Everything ships **off**.

## Where
- Admin → Sales CRM → **Import customer list** button (CSV or XLSX, column mapping, preview, batches of 500).
- Admin → Sales CRM → **Outreach** view (status, settings, sequence, enrol, preview, approval queue, contacts, suppression list, audit log).
- tRPC: `crmOutreach.*` (server/routers/crmOutreach.ts, all `adminProcedure`).
- Engine: server/lib/outreach/ (engine.ts, ai.ts, render.ts, replies.ts, store.ts, contacts.ts, config.ts, runtime.ts).
- Public routes: server/outreachHttp.ts
  - `GET|POST /api/outreach/unsubscribe/:token` (link + RFC 8058 one-click)
  - `GET /api/outreach/c/:token/:messageId/:key` (click tracking; redirects only to /design or /)
  - `POST /api/outreach/inbound` (Svix-signed inbound replies)
  - `POST /api/outreach/events` (Svix-signed Resend delivery events: bounced, complained)
- Scheduler: node-cron every 15 minutes in server/_core/index.ts → `runScheduledOutreach()`.
- Design-start signal: `design.captureLead` calls `recordOutreachDesignStart(email)` (fire-and-forget, no-op unless OUTREACH_ENABLED=true).
- SQL: docs/sql/0286_crm_customer_import_outreach.tidb.sql (7 new tables, nothing existing altered).

## Env vars (Railway, cabinet-backend)
| Var | Needed for | Notes |
| --- | --- | --- |
| `OUTREACH_ENABLED` | any real send | must be exactly `true`; anything else = off |
| `OUTREACH_MAILING_ADDRESS` | any real send | CAN-SPAM postal address in every footer; sends are refused without it |
| `OUTREACH_BUSINESS_NAME` | optional | footer name, default `CabinetDealz` |
| `OUTREACH_PUBLIC_BASE_URL` | optional | https origin for links, default `https://www.cabinetdealz.com` |
| `OUTREACH_REPLY_TO` | auto mode | inbound address whose mail is posted to `/api/outreach/inbound`; default Reply-To is OWNER_EMAIL |
| `OUTREACH_INBOUND_WEBHOOK_SECRET` | auto mode | Svix signing secret for `/api/outreach/inbound` |
| `OUTREACH_EVENTS_WEBHOOK_SECRET` | bounce handling | Svix signing secret for `/api/outreach/events` (Resend webhook: email.bounced, email.complained) |
| `OUTREACH_BLOCKED_NAMES` | optional | extra comma-separated names the AI must never write |
| existing `RESEND_API_KEY` + `ORDER_EMAIL_FROM` (or SMTP) | sending | the existing mailer; From is ORDER_EMAIL_FROM |
| existing `GEMINI_API_KEY` | AI drafts | without it every draft uses the fixed templates |
| existing `OWNER_EMAIL` | alerts | replies and "are you a bot?" questions go here |

## Safeguards
- Two switches: `OUTREACH_ENABLED=true` **and** the admin toggle. Default mode is **preview** (drafts, never sends).
- Modes: preview → approval queue → automatic. Automatic silently falls back to approval until reply detection (`OUTREACH_REPLY_TO` + `OUTREACH_INBOUND_WEBHOOK_SECRET`) is configured.
- Daily cap (rolling 24 h, default 25) and per-contact cap (default 3), plus a hard 20-hour minimum gap between two emails to one person.
- Suppression list checked at enrolment, at drafting and again right before every send. Unsubscribe, bounce, spam complaint and "stop" replies add to it. Nothing removes from it.
- Every email: honest From (the existing sender), plain subject (no Re:/Fwd:), signature, why-you-got-this line, postal address, unsubscribe link, `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers.
- AI drafts pass a gate (server/lib/outreach/ai.ts `checkOutreachDraft`): no human claims, no supplier/distributor names (built-in list + `distributors.brandName` + env list), no money/discounts beyond Tom's own offer text, no number that is not in the contact facts, no links/emails/placeholders. Two failures → fixed reviewed template.
- Replies are never answered automatically. Any reply stops the sequence and emails Tom. "Are you a person or a bot?" puts the contact in `needs_owner` and tells Tom to answer personally and not deny automation.
- Every draft, approval, send, failure, unsubscribe, bounce, reply, click, design start and settings change is in `outreach_events`.

## Turning it on
1. Run docs/sql/0286 blocks 1–9 in the TiDB editor.
2. Set `OUTREACH_MAILING_ADDRESS` (and optionally the other vars) on Railway. Leave `OUTREACH_ENABLED` unset for now.
3. Import the list, enrol it, and use **Preview** on a few contacts.
4. Set `OUTREACH_ENABLED=true`, switch outreach on in the admin tab in **preview** mode, and read the drafts the scheduler makes.
5. Switch to **approval** mode, approve a small batch, watch the audit log.
6. Only after reply detection and bounce events are wired, consider **automatic** mode.
To stop everything at once: switch off in the admin tab, or remove `OUTREACH_ENABLED`.
