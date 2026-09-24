# Parcel Shipping Rules and Integration Audit

**Author:** Manus AI  
**Reviewed:** September 23, 2026  
**Scope:** UPS, FedEx Ground/Home Delivery, EasyPost parcel rating, and Worldwide Express/SpeedShip.

## Conclusion

CabinetDealz now has a defensible **parcel-screening boundary** for verified cartons. A carton must have authoritative exterior dimensions and packaged weight. It is normalized to whole-inch and whole-pound values before the system evaluates UPS, FedEx, and USPS limits. A shipment may enter the parcel-rating path only when every carton has at least one common eligible carrier.

The review found that the former EasyPost request path could rate any UPS, FedEx, or USPS response without carrying forward the shared eligibility result. This has now been corrected. The parcel quote request must receive the carrier intersection that passed the screening rule, must use positive whole-inch and whole-pound cartons, and filters live rates to those approved carriers only. It does not invent a rate or permit a rate response from a carrier that failed the shipment's eligibility screen.

Worldwide Express has a real parcel program through SpeedShip, but the public material does not provide a usable, account-authorized parcel API contract. The present Worldwide Express implementation remains **LTL-only**. This is the correct behavior until Worldwide Express supplies the account's parcel endpoint, credentials and scopes, schemas, carrier permissions, and test process.

## Carrier Rules That Are Enforced as Hard Parcel Limits

| Carrier service | Maximum package weight | Maximum length | Maximum length plus girth | Current CabinetDealz outcome |
|---|---:|---:|---:|---|
| UPS small package | 150 lb | 108 in | 165 in | Eligible only when all verified cartons remain within the envelope. |
| FedEx Ground / Home Delivery | 150 lb | 108 in | 165 in | Eligible only when all verified cartons remain within the envelope. |
| USPS Ground Advantage | 70 lb | No separate screen in the shared rule | 130 in | Eligible when within USPS weight and girth limits; 108–130 in is marked oversized and must be live-rated. |

UPS requires dimensions to be rounded up to whole inches and package weight to be rounded up to whole pounds. The shared CabinetDealz normalizer applies that conservative convention before it evaluates every carrier. UPS and FedEx define length as the longest side and girth as twice the width plus twice the height. [1] [2]

These are **acceptance-envelope rules**, not promises of an ordinary-rate shipment. A package that passes them may still have a handling charge, oversize charge, dimensional-weight adjustment, packaging restriction, service restriction, or carrier audit adjustment.

## UPS Review

The implemented UPS maximum envelope is correct: no more than 150 lb, 108 inches in length, and 165 inches in length plus girth. UPS uses several lower thresholds that can still leave a carton eligible while materially changing the rate. Current domestic Additional Handling conditions include actual weight above 50 lb, length above 48 in, second-longest side above 30 in, length plus girth above 105 in, cubic size above 10,368 cubic inches, and certain package-form or irregular-sort conditions. Domestic Large Package conditions include actual weight above 110 lb, length above 96 in, length plus girth above 130 in, or cubic size above 17,280 cubic inches. [3] [4]

A package over 70 lb also requires a UPS heavy-package sticker. That requirement is distinct from the 50-lb Additional Handling threshold. [5]

The application does not currently model carton material, corrugated enclosure, banding, shrink wrap, cylindrical form, protrusions, wheels, handles, straps, or irregular-sort conditions. It therefore must not claim that a UPS-eligible carton is free of handling risk. The live carrier result remains the price authority, and fulfillment must still verify packaging and restricted-commodity requirements. [3] [6]

## FedEx Review

The FedEx Ground/Home Delivery maximum envelope is also correctly implemented as 150 lb, 108 inches in length, and 165 inches in length plus girth. Packages above these limits are unauthorized for the ordinary Ground/Home Delivery parcel service, even though FedEx may exercise discretion in handling them. [2] [7]

FedEx has rating thresholds below that hard envelope. Additional Handling includes actual weight above 50 lb, length above 48 in, second-longest side above 30 in, length plus girth above 105 in, cubic size above 10,368 cubic inches, and non-standard packaging. Oversize includes actual weight above 110 lb, length above 96 in, length plus girth above 130 in, or cubic size above 17,280 cubic inches. FedEx bills based on the greater of actual and dimensional weight, using a stated U.S. divisor of 139. [2] [7] [8]

FedEx service choice also depends on the destination. Ground is intended for commercial addresses, while Home Delivery is for residential addresses. Neither standard service delivers to a Post Office Box. Home Delivery has additional hazardous-material restrictions. The customer-facing implementation should treat the returned live carrier service and the verified address type as authoritative; a bare carrier name is insufficient to prove service compatibility. [7] [9]

## Current EasyPost Integration Boundary

The parcel route sends each verified carton separately to EasyPost. This avoids inventing a multi-carton consolidation charge. Catalog weight is converted from pounds to ounces only when building the EasyPost parcel request. The result is a sum of actual returned parcel rates, not a shipping estimate.

The review repair adds three controls. First, the quote function rejects a parcel when the dimensions or weight are not positive whole numbers, which prevents a fractional or malformed package from bypassing the normalizer. Second, the freight router passes the common eligible-carrier set produced by the shared parcel screen. Third, the rate selector filters returned services to that set before it chooses a rate. A carton that is eligible for UPS only cannot be priced with a returned USPS or FedEx rate.

This is still not a carrier contract engine. The live carrier response controls final service availability, negotiated price, surcharges, transit promise, and later carrier audit. The application now classifies handling and oversize risk separately from hard rejection, without hard-coding public surcharge dollar amounts that can vary by contract and effective date.

## Worldwide Express / SpeedShip Review

Worldwide Express publicly states that SpeedShip supports parcel functions such as rate and service shopping, labels, booking, tracking, insurance, and e-commerce/ERP integrations. It also markets UPS small-package services. [10] [11] [12]

That public evidence proves **capability**, not an implementation contract. The public OAuth discovery document identifies an authorization server and supports client credentials, but it does not specify a parcel-rate resource, account entitlement, required scope, account binding, request schema, response schema, carrier service list, label lifecycle, or sandbox behavior. [13]

For that reason, the current system does not send a parcel request to Worldwide Express. Its adapter builds an LTL ShopFlow payload with `productType: "LTL"`, pallets, and freight classes. The freight router reserves the parcel branch for EasyPost and routes Worldwide Express through the palletized LTL flow. The administrative Worldwide Express test path now uses the same freight-class normalizer and safe class-175 fallback as the customer and saved-design paths.

> Worldwide Express parcel integration must remain disabled until the account representative provides a versioned, account-authorized parcel integration package. The existing LTL endpoint and payload must never be reused or inferred for parcel shipping.

## Required Information Before Enabling Worldwide Express Parcel Rates

Worldwide Express should provide written confirmation that the account is entitled to SpeedShip parcel rating and identify the authorized carriers and services. The integration package must include separate sandbox and production base URLs, exact paths, HTTP methods, OAuth audience and scopes, account or billing identifiers, request and response schemas, and successful/failed sample payloads.

The package must also define package units, addresses, residential and accessorial handling, declared value and insurance, hazardous-material and customs treatment, rate-total semantics, rate limits, label and void operations, tracking/webhook behavior, idempotency, and the approved non-booking production test. Only then should CabinetDealz add a separately feature-gated Worldwide Express parcel client.

## Recommended Next Controls

The immediate integration boundary and the first **classification layer** are complete. The package editor, cart, and order review now expose UPS Additional Handling, UPS Large Package, UPS heavy-package-label status, FedEx Additional Handling, and FedEx Oversize as review flags. These are warnings and rating factors, not automatic parcel rejections. Dimensional-weight risk remains a carrier-rating concern because the public rules and negotiated accounts can differ by effective date and service.

The catalog should also capture authoritative outer-carton form data. Relevant fields include whether the item is fully corrugated and enclosed, soft-pack status, wrapping or banding, cylindrical form, protrusions, wheels, handles, straps, and irregular-sort characteristics. Until those fields are verified, the application should disclose that carrier handling charges or refusal can still apply.

Finally, checkout should preserve the live carrier response and carrier invoice reconciliation information. It should never represent a generic screening result as a guaranteed rate or final carrier acceptance.

## References

[1]: https://www.ups.com/us/en/support/shipping-support/shipping-dimensions-weight "UPS Package Dimensions, Size Limits and Weight Guide"
[2]: https://www.fedex.com/content/dam/fedex/us-united-states/services/Service_Guide_2026.pdf "FedEx Service Guide 2026"
[3]: https://assets.ups.com/adobe/assets/urn:aaid:aem:c6bf8a2f-018f-4aa0-838b-ffc1a75eb1d9/original/as/terms-carriage-us-en.pdf "UPS Tariff and Terms and Conditions of Service, United States"
[4]: https://www.ups.com/us/en/support/shipping-support/shipping-dimensions-weight/avoid-additional-shipping-fees "UPS Shipping Charge Corrections and Additional Fees"
[5]: https://www.ups.com/us/en/support/shipping-support/shipping-dimensions-weight/shipping-heavy-items "UPS Heavy Package Shipping Guidance"
[6]: https://www.ups.com/us/en/support/shipping-support/shipping-special-care-regulated-items/prohibited-items "UPS Prohibited and Restricted Items"
[7]: https://www.fedex.com/en-us/shipping/ground.html "FedEx Ground and Home Delivery"
[8]: https://www.fedex.com/en-us/shipping/packaging/what-is-dimensional-weight.html "FedEx Dimensional Weight"
[9]: https://www.fedex.com/en-us/shipping/home-delivery.html "FedEx Home Delivery"
[10]: https://www.wwex.com/technology/speedship "Worldwide Express SpeedShip Freight and Parcel TMS"
[11]: https://www.wwex.com/shipping-resources/speedship-parcel-tms "Worldwide Express SpeedShip Parcel TMS"
[12]: https://www.wwex.com/shipping-services/ups-parcel-shipping "Worldwide Express UPS Parcel Shipping"
[13]: https://auth.wwex.com/.well-known/openid-configuration "Worldwide Express OpenID Connect Discovery Document"
