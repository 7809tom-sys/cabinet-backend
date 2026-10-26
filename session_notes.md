# Session Notes - July 9, 2026

## Oxford Cashmere & Shaker Unfinished Status
- Both door styles ARE in the database: id=150001 (Oxford Cashmere), id=150002 (Shaker Unfinished)
- Both have thumbnailImageUrl set correctly
- Both are isActive=1
- Problem: IDs are 150001/150002 (very high), pagination may be cutting them off
- The Door Styles page shows 3 pages of ~22 styles each = ~66 total, but OC/SU are not appearing
- Need to check the listStyles tRPC procedure to see if it has a WHERE clause filtering by ID range or distributor

## Server Error
- `registerQboRoutes is not defined` error in server log
- This is a runtime error in server/_core/index.ts
- The fix was applied (intuit-oauth CJS import via createRequire) but may not have taken effect
- Need to verify server/_core/index.ts and server/qboOAuth.ts are correct

## USCD P&A V6 Pricing Key Findings
- Column 1 (SW/SA/SD/SG/SU): Shaker White, Antique White, Dove, Grey, **Unfinished** - SAME PRICE
- Column 3 (OW/OC/OS/CW/CS/HD): Oxford White, **Cashmere**, Oxford Sage, Casselberry White/Saddle, Haven Dune - SAME PRICE
- So Oxford Cashmere = Oxford White price, Shaker Unfinished = Shaker White price
- Full price audit of all USCD SKUs still pending

## USCD Shipping Policy
- Still need to retrieve from their website while logged in
- URL to check: https://www.uscabinetdepot.com/shipping-policy or similar

## Door Style Filter Tabs
- Confirmed working: All Styles, Raised Panel, Shaker, Slab, Slim Shaker
- Casselberry, Double Shaker, Edgeline, Haven, Oxford remapped in DB

## QuickBooks Integration
- QBO OAuth routes: /api/qbo/connect, /api/qbo/callback, /api/qbo/status, /api/qbo/disconnect
- qbo_tokens table created in DB
- qboInvoiceId, qboSyncedAt columns added to order_requests
- CSV export button in admin Incoming Orders panel
- QuickBooks tab in Admin > Settings
- Credentials needed: QBO_CLIENT_ID, QBO_CLIENT_SECRET (from developer.intuit.com)
- Redirect URI: https://www.cabinetdealz.com/api/qbo/callback

## Checkpoints
- v173fa656: Stripe approval pages + footer contact info
- vd1c85f65: Vendor warranty/return policies + sales tax calculator
- vef7b855d: QuickBooks Online full integration
