import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cartSource = readFileSync(resolve(process.cwd(), "client/src/pages/Cart.tsx"), "utf8");
const cartContextSource = readFileSync(resolve(process.cwd(), "client/src/contexts/CartContext.tsx"), "utf8");
const builderSource = readFileSync(resolve(process.cwd(), "client/src/pages/OrderBuilder.tsx"), "utf8");
const reviewSource = readFileSync(resolve(process.cwd(), "client/src/components/order/OrderReview.tsx"), "utf8");
const prefillSource = readFileSync(resolve(process.cwd(), "client/src/lib/cartCheckoutPrefill.ts"), "utf8");
const loadingSource = readFileSync(resolve(process.cwd(), "client/src/components/order/FreightCalculatingStatus.tsx"), "utf8");

describe("cart live freight quoting", () => {
  it("rates eligible cart cabinet items using their exact supplier and style identity", () => {
    expect(cartSource).toContain("const cartFreightItems");
    expect(cartSource).toContain("item.distributorId != null");
    expect(cartSource).toContain("trpc.freight.estimate.useQuery(cartFreightInput");
    expect(cartSource).toContain("distributorId: optionalPositiveFreightId(item.distributorId)");
    expect(cartSource).toContain("Get shipping quote");
  });

  it("converts legacy zero cart IDs to null before the positive-ID freight schema validates them", () => {
    expect(cartSource).toContain('import { optionalPositiveFreightId } from "@shared/freight"');
    expect(cartSource).toContain("styleId: optionalPositiveFreightId(item.styleId)");
    expect(cartSource).toContain("distributorId: optionalPositiveFreightId(item.distributorId)");
    expect(reviewSource).toContain("optionalPositiveFreightId(line.cartStyleId)");
  });

  it("shows the live carrier pallet plan instead of a generic shipping estimate", () => {
    expect(cartSource).toContain("shipmentGroups");
    expect(cartSource).toContain("lb contents");
    expect(cartSource).toContain("lb billed");
    expect(cartSource).toContain("Pallet {index + 1}");
  });

  it("shows a live parcel method only when the carrier returned eligible verified cartons", () => {
    expect(cartSource).toContain('group.transportMode === "parcel"');
    expect(cartSource).toContain("Live UPS/FedEx/USPS service");
    expect(cartSource).toContain("verified carton");
    expect(cartSource).toContain("parcel.carrier");
    expect(cartSource).toContain("group.parcelReviewWarnings?.length");
    expect(cartSource).toContain("Carrier handling review:");
  });

  it("discloses when the approved generic package rule supplied carton measurements", () => {
    expect(cartSource).toContain("group.estimatedPackageCount");
    expect(cartSource).toContain("Generic flat-pack measurements used for");
    expect(cartSource).toContain("Exact supplier package data replaces these estimates automatically");
    expect(cartSource).toContain('? "estimated" : "verified"');
  });

  it("offers a UPS-only check without treating a pallet as a UPS carton", () => {
    expect(cartSource).toContain('id="ups-parcel-quote"');
    expect(cartSource).toContain("Prefer a UPS package quote");
    expect(cartSource).toContain('carrierPreference: requestUpsParcelQuote ? "ups" as const : undefined');
    expect(cartSource).toContain("Check UPS / freight");
    expect(cartSource).toContain("uncheck this option to request the configured LTL/live-freight path");
    expect(cartSource).toContain("cartFreightEstimate.data.reason");
  });

  it("preserves the cart supplier selection when the customer continues into Order Review", () => {
    expect(builderSource).toContain("applyCartCheckoutPrefill(line, cartLine)");
    expect(prefillSource).toContain("cartDistributorId: item.distributorId ?? null");
    expect(reviewSource).toContain("distributorId: optionalPositiveFreightId(line.cartDistributorId)");
  });

  it("carries an intentional UPS parcel preference into secure checkout", () => {
    expect(cartSource).toContain('carrierPreference: requestUpsParcelQuote ? "ups" : null');
    expect(builderSource).toContain('if (decoded.carrierPreference === "ups") setCarrierPreference("ups")');
    expect(builderSource).toContain("carrierPreference={carrierPreference ?? undefined}");
    expect(reviewSource).toContain("carrierPreference,");
    expect(reviewSource).toContain("UPS package quote requested from cart.");
  });

  it("allows mixed vendors and keeps freight groups separate", () => {
    expect(cartContextSource).toContain("Multiple cabinet distributors and Pelican may");
    expect(cartContextSource).toContain('SUPPLIER_CONFLICT_KEY = "cd_cart_supplier_conflict_v1"');
    expect(cartSource).toContain('data-testid="cart-vendor-section"');
    expect(cartSource).toContain("shipmentGroups");
    expect(cartSource).toContain("Other shipment quotes remain separate");
  });

  it("shows an accessible spinner and status while the live carrier rate is calculated", () => {
    expect(cartSource).toContain('aria-busy={cartFreightEstimate.isFetching}');
    expect(cartSource).toContain("<FreightCalculatingStatus upsRequested={requestUpsParcelQuote} compact />");
    expect(reviewSource).toContain('<FreightCalculatingStatus upsRequested={carrierPreference === "ups"} />');
    expect(loadingSource).toContain('role="status"');
    expect(loadingSource).toContain('aria-live="polite"');
    expect(loadingSource).toContain("Calculating freight...");
    expect(loadingSource).toContain("Checking UPS with the cart’s package dimensions and weight");
    expect(loadingSource).toContain("animate-spin");
    expect(loadingSource).toContain("motion-safe:animate-ping");
    expect(cartSource).toContain("cartFreightEstimate.isFetching || !normalizedZip || cartFreightItems.length === 0");
    expect(cartSource).toContain("!cartFreightEstimate.isFetching && cartFreightEstimate.data");
  });

  it("shows carrier transit time and a non-guaranteed delivery estimate after rating completes", () => {
    expect(cartSource).toContain("Estimated carrier transit:");
    expect(cartSource).toContain("Quoted arrival date:");
    expect(cartSource).toContain("Carrier estimate only; not guaranteed.");
    expect(cartSource).toContain("Warehouse processing and order preparation occur before pickup.");
  });

  it("exempts only the temporary one-dollar payment test item from freight quoting", () => {
    expect(cartSource).toContain("isTemporaryOneDollarFreeShippingOrder(items)");
    expect(cartSource).toContain("!isTemporaryOneDollarCheckoutTestItem(item)");
    expect(cartSource).toContain("Free test shipping");
    expect(reviewSource).toContain("hasOnlyTemporaryFreeShippingItems");
    expect(reviewSource).toContain("!isTemporaryOneDollarCheckoutTestItem(line)");
    expect(reviewSource).toContain("freight-exempt for this payment-flow test");
  });
});
