# Vendor shipping quote contract

Version: `2026-10-26`

A supplier that has its own quote API can receive a shipping quote request from Cabinet Dealz. The same result shape is used for every supplier. Pelican does not publish a shipping, freight, EDI, or dealer API. Its named adapter stays unconfigured until Pelican provides one. The generic HTTPS provider is for suppliers that do have an endpoint.

Quotes on the product page and in the cart are informational. Checkout still quotes after a complete delivery address, and this quote is not added to the Stripe total.

## Priority

For each supplier in the cart:

1. That supplier's live quote API, when the supplier has turned it on and an administrator has enabled it.
2. That supplier's own posted data: zip, flat, and free-over-threshold rules, a hardware standalone fee, or a carrier rate built only from supplier-verified package profiles. These are vendor rates.
3. The site estimator: comparison-package weights, freight class 175, and Estimator Zones. Only this step is labeled an estimate.

## What Cabinet Dealz sends

`POST` the supplier's HTTPS URL. The auth header name is the one the supplier saved. The secret value is sent in that header and is stored encrypted on the server. It is never returned to the browser.

```json
{
  "contractVersion": "2026-10-26",
  "vendorScope": "dist:12",
  "destinationZip": "30301",
  "shipFromZip": "33760",
  "freightClass": "70",
  "serviceCodes": ["GROUND"],
  "items": [
    {
      "sku": "SKU-1",
      "qty": 2,
      "weightLbs": 40,
      "lengthIn": 24,
      "widthIn": 18,
      "heightIn": 12,
      "freightClass": "70"
    }
  ]
}
```

`vendorScope` is `pelican` or `dist:<id>`. Respond within 8 seconds. Cabinet Dealz keeps a successful quote for about two minutes.

## What the supplier returns

```json
{
  "options": [
    {
      "carrier": "Example Freight",
      "method": "LTL",
      "costCents": 18500,
      "transitDays": 4,
      "expiresAt": "2026-10-26T18:00:00.000Z"
    }
  ]
}
```

`costCents` is a whole number of cents. `carrier`, `transitDays`, and `expiresAt` may be omitted. Any other field, including a copy of the auth secret, is ignored. HTTP errors are not shown to the customer.

## Environment variables

These are documented and left unset. Pelican's adapter returns "not configured" even if they are filled in, because there is no public Pelican quote API to call.

- `PELICAN_SHIPPING_QUOTES_ENABLED` must be the string `true` before the named adapter is considered.
- `PELICAN_SHIPPING_QUOTE_API_KEY`
- `PELICAN_SHIPPING_QUOTE_API_URL`

## Follow-up

Per-SKU shipping profiles stay on Pelican (`pelican_shipping_profiles`). Cabinet and hardware package dimensions can feed a site estimate weight. They are not treated as supplier-verified profiles. Extending verified per-SKU profiles to every supplier is a later change.

## Quartz weight

The comparison rule `quartz-slab-v1` uses 600 lb per slab. Pelican's public catalog lists 800 lb for 3cm and 1,080 lb for Super Jumbo. Quartz estimates that use the comparison rule can be low. The stored rule and live profile rows are unchanged. An administrator can run a read-only catalog comparison from the Pelican shipping profiles screen.
