import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriceCard } from "./CabinetDetail";

const ownerRow = {
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
  yourCost: "237.32",
  platformSku: "FS-W1230",
  leadTimeDays: 7,
  distributorId: 210001,
};

describe("affiliate owner private price card", () => {
  it("renders My Cost, Sells At, and Margin only when server-authorized cost is present", () => {
    const ownerMarkup = renderToStaticMarkup(
      <PriceCard row={ownerRow} tier="homeowner" isOwner />,
    );
    expect(ownerMarkup).toContain("Owner view · not shown to customers");
    expect(ownerMarkup).toContain("My Cost");
    expect(ownerMarkup).toContain("Sells At (Homeowner)");
    expect(ownerMarkup).toContain("Margin");
    expect(ownerMarkup).toContain("$237.32");

    const customerMarkup = renderToStaticMarkup(
      <PriceCard row={{ ...ownerRow, yourCost: null }} tier="homeowner" />,
    );
    expect(customerMarkup).not.toContain("Owner view · not shown to customers");
    expect(customerMarkup).not.toContain("My Cost");
  });
});
