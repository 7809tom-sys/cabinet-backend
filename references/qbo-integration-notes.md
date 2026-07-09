# QuickBooks Online Integration Notes

## OAuth2 Flow (Intuit)
- Docs: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
- Node.js SDK: `npm install intuit-oauth` (already installed)
- Community SDK: `node-quickbooks` (already installed)

### Required Credentials (from Intuit Developer Portal)
- `QBO_CLIENT_ID` — from app's Keys & OAuth tab
- `QBO_CLIENT_SECRET` — from app's Keys & OAuth tab
- `QBO_REDIRECT_URI` — must match exactly: `https://www.cabinetdealz.com/api/qbo/callback`
- `QBO_ENVIRONMENT` — "sandbox" or "production"

### OAuth2 Flow
1. Admin clicks "Connect to QuickBooks" → GET /api/qbo/connect → redirects to Intuit auth page
2. User authorizes → Intuit redirects to /api/qbo/callback?code=...&state=...&realmId=...
3. Server exchanges code for access_token + refresh_token + realmId
4. Tokens stored in `qbo_tokens` DB table (single row, upserted)
5. Subsequent API calls use access_token; refresh when expired using refresh_token

### Token Storage (qbo_tokens table)
- accessToken: text
- refreshToken: text
- realmId: varchar(64) — the QuickBooks company ID
- expiresAt: timestamp — access token expiry (1 hour)
- refreshExpiresAt: timestamp — refresh token expiry (100 days)
- connectedAt: timestamp

### Invoice Creation API
- POST https://quickbooks.api.intuit.com/v3/company/{realmId}/invoice
- Requires: CustomerRef (name), Line items (Description, Amount, DetailType=SalesItemLineDetail)
- Returns: Invoice.Id (store as qbo_invoice_id on order_requests)

### Packages installed
- `intuit-oauth` v4.2.3 — OAuth2 flow
- `node-quickbooks` v2.0.50 — API calls (create invoice, etc.)

### Schema changes needed
1. New table: `qbo_tokens` (single row for the connected QBO company)
2. New columns on `order_requests`: `qboInvoiceId`, `qboSyncedAt`
