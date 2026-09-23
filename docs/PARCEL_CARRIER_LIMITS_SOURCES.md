# Parcel Carrier Eligibility Sources

This implementation uses a conservative, **eligibility-only** screen. A carton must have authoritative package dimensions and packaged weight, and the carrier must return a live rate before CabinetDealz presents a parcel service or charge. The screen does not guarantee that a carrier will accept a shipment, and it must be reviewed when a carrier changes its service guide.

| Carrier/service basis | Implemented hard limits | Operational handling | Official source |
|---|---:|---|---|
| UPS parcel | 150 lb; 108 in maximum length; 165 in length plus girth | Dimensions are rounded up to whole inches before screening. Packages above 70 lb may require UPS heavy-package handling. | [UPS — Package Dimensions, Size Limits and Weight Guide](https://www.ups.com/us/en/support/shipping-support/shipping-dimensions-weight) |
| FedEx Ground / Home Delivery | 150 lb; 108 in maximum length; 165 in length plus girth | The live rate must select the final service. The FedEx guidance also calls for a heavyweight label above 75 lb. | [FedEx — General Packaging Guidelines](https://www.fedex.com/content/dam/fedex/us-united-states/services/GrlPkgGuidelines_fxcom.pdf) |
| USPS Ground Advantage | 70 lb; 130 in length plus girth | USPS Ground Advantage cartons between 108 and 130 in length plus girth are eligible but oversized; their final price must be live-rated. | [USPS — Parcel Size, Weight & Fee Standards](https://faq.usps.com/s/article/Parcel-Size-Weight-Fee-Standards) |

EasyPost documents that parcel dimensions are in inches and parcel weight is in ounces, and that a shipment requires an origin/destination address and parcel for rating. It supports restricting carrier accounts when the account configuration requires it. CabinetDealz converts its catalog’s authoritative packaged pounds to ounces only in the EasyPost request and limits parcel-rate selection to UPS, FedEx, and USPS services. See [EasyPost Parcel documentation](https://docs.easypost.com/docs/parcels) and [EasyPost Shipment documentation](https://docs.easypost.com/docs/shipments).

## Worldwide Express / SpeedShip parcel program

Worldwide Express **does offer parcel shipping** through SpeedShip, including UPS parcel rate shopping, labels, tracking, insurance, and e-commerce integrations. The public product page also confirms that SpeedShip supports both parcel and freight in one TMS: [Worldwide Express — SpeedShip](https://www.wwex.com/technology/speedship).

The stored CabinetDealz Worldwide Express integration is intentionally **LTL-only** today. Its verified account-specific `shopFlow` request uses `productType: "LTL"`, pallets, and SpeedShip freight classes. Worldwide Express does not publish a stable public parcel-rate REST endpoint or parcel request schema on its public site. Therefore CabinetDealz must not send eligible cartons to the LTL endpoint or invent a parcel payload. A WWEX parcel route can be enabled only after the account representative supplies the authorized parcel rate endpoint, required request/response schema, account/credential scope, and production/sandbox behavior. Until then, eligible cartons may use an approved EasyPost carrier account; all other shipments stay on the established LTL route.
