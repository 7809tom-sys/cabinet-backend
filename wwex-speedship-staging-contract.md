# WWEX Speedship V4 Staging Contract

Source: user-supplied `SpeedshipAPIV4Staging.zip`, inspected without executing its contents on 2026-09-10.

The supplied Postman collection documents the following staging configuration for LTL rate shopping:

- OAuth token URL: `https://auth.staging-wwex.com/oauth/token`
- OAuth grant: `client_credentials`
- Required staging audience: `staging-wwex-apig`
- LTL shop endpoint: `https://speedship.staging-wwex.com/svc/shopFlow`
- Rate request root: `request.productType = "LTL"` with `request.shipment`.
- The shipment contains `handlingUnitList`, origin/destination addresses, a shipment date, total handling-unit count, total weight, and delivery-accessorial flags.

The collection’s examples identify city, state, country, and postal code as the usable location fields for a ZIP-level rate request. The application must never invent a customer street address. It therefore sends only verified ZIP-derived city/state data with an empty required address-line list and marks the rate request to skip address verification; a full delivery address remains necessary before carrier booking.

No API credentials, account identifiers, sample customer data, or private provider response bodies are included in this file.
