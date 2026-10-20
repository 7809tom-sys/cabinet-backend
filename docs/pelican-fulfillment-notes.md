# Pelican vendor fulfillment: research and findings (2026-10-20)

## External research (shipping/tracking API for Pelican)
- Web search ("Pelican Surfaces and Fixtures dealer portal order tracking API", "Pelican Imports ... tracking API", "Pelican ... EDI order status") found NO public Pelican Int'l (buildpelican.com) shipping, order-status or tracking API.
- Pelican Int'l storefront: https://buildpelican.com/ (wholesale sinks, faucets, toilets, flooring; pickup order info and locations pages exist).
- Generic EDI references for supplier order status: EDI 870 Order Status Report - https://www.spscommerce.com/edi-document/edi-870-order-status-report/ and https://www.cleo.com/edi-transactions/edi-870
- Conclusion: automatic pickup of Pelican shipments would require Pelican to provide EDI (214/856/870) or a portal/API credential. Not available publicly. Carrier-side tracking (EasyPost Trackers, UPS/FedEx tracking APIs) works from carrier + tracking number, so capturing those two fields cleanly is the prerequisite.

## Internal findings
- Pelican vendor identity = vendor_lines row id 1, sourceKey "pelican", contact 7809tom@gmail.com. There is NO distributors row with code PEL (distributors: SK, CS, USCD, AEF, HRDW).
- vendors.list reports Pelican portalReadiness "profile-only", linkedDistributor null. VendorPortal therefore treats /vendor?vendor=1 as supplierProfileOnly (only Supplier Profile nav) and isPelican (activeDistCode === "PEL") is never true.
- Earlier checkpoint fa150afd guarded Pelican procedures with requirePelicanVendor (distributor code must be PEL) + distributorProcedure (needs users.distributorId). Both fail for a real Pelican vendor login, so only admins could use them. Needs fixing: identify Pelican by approvedVendorLineId -> vendor_lines.sourceKey = "pelican".
- Real order data: 73 order_requests; none paid via the rail except 1 affiliate order in affiliate_review. Order lines carry productKind ("surface" for Pelican, "hardware" for Hardware Resources, null for cabinets), distributorId (cabinets), pelicanProductId/vendorProductId.
- No carrier label-purchase code exists (EasyPost/UPS/FedEx modules only quote). A printable ship-to label + packing slip is feasible; postage labels are not.
