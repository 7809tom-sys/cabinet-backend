import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriceCard } from "./CabinetDetail";

const priceRow = {
  styleId: 330005,
  styleCode: "FS",
  name: "Fresh Sage",
  doorStyle: "Shaker",
  finish: "Fresh Sage",
  color: "#9AAE97",
  doorSampleImageUrl: null,
  roomSceneImageUrl: null,
  thumbnailImageUrl: null,
  listPrice: "753.39",
  adjustedListPrice: "372.93",
  wholesalePrice: null,
  contractorPrice: null,
  homeownerPrice: "372.93",
  yourCost: null,
  affiliateCost: null,
  platformSku: "FS-W1230",
  leadTimeDays: 7,
  distributorId: 210001,
};

describe("role-specific private price cards", () => {
  it("shows raw My Cost and a raw-cost margin only in Administration", () => {
    const adminMarkup = renderToStaticMarkup(
      <PriceCard row={{ ...priceRow, yourCost: "220.00" }} tier="homeowner" viewerRole="admin" />,
    );
    expect(adminMarkup).toContain("Administration view · not shown to customers");
    expect(adminMarkup).toContain("My Cost");
    expect(adminMarkup).toContain("$220.00");
    expect(adminMarkup).toContain("$152.93 (41%)");
    expect(adminMarkup).not.toContain("Affiliate Cost");
  });

  it("shows only the adjusted Affiliate Cost and calculates margin from it for an affiliate owner", () => {
    const affiliateMarkup = renderToStaticMarkup(
      <PriceCard row={{ ...priceRow, affiliateCost: "237.32" }} tier="homeowner" viewerRole="affiliate-owner" />,
    );
    expect(affiliateMarkup).toContain("Affiliate view · not shown to customers");
    expect(affiliateMarkup).toContain("Affiliate Cost");
    expect(affiliateMarkup).toContain("$237.32");
    expect(affiliateMarkup).toContain("$135.61 (36.4%)");
    expect(affiliateMarkup).not.toContain("My Cost");
  });

  it("does not render either private cost field for a customer", () => {
    const customerMarkup = renderToStaticMarkup(
      <PriceCard row={priceRow} tier="homeowner" />,
    );
    expect(customerMarkup).not.toContain("Administration view · not shown to customers");
    expect(customerMarkup).not.toContain("Affiliate view · not shown to customers");
    expect(customerMarkup).not.toContain("My Cost");
    expect(customerMarkup).not.toContain("Affiliate Cost");
  });
});
