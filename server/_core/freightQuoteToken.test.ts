import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFreightQuoteToken, freightItemsHash, verifyFreightQuoteToken } from "./freightQuoteToken";

const originalSecret = process.env.JWT_SECRET;
const deliveryAddress = {
  line1: "123 Main Street",
  line2: null,
  city: "Orlando",
  state: "FL",
  zip: "32801-1234",
};

beforeEach(() => {
  process.env.JWT_SECRET = "freight-token-test-secret";
});

afterEach(() => {
  process.env.JWT_SECRET = originalSecret;
});

describe("freight quote token", () => {
  const items = [
    { cabinetId: 10, masterCode: "B24", styleId: 4, distributorId: 2, qty: 2 },
    { cabinetId: 11, masterCode: " W3030 ", styleId: 4, distributorId: 2, qty: 1 },
  ];

  it("round-trips the exact server quote inputs and ignores item ordering", () => {
    const token = createFreightQuoteToken({
      totalCents: 92345,
      merchandiseSubtotalCents: 400000,
      deliveryAddress,
      residential: true,
      liftgate: true,
      items,
    });
    const payload = verifyFreightQuoteToken(token);
    expect(payload).toMatchObject({
      totalCents: 92345,
      merchandiseSubtotalCents: 400000,
      destinationZip: "32801",
      residential: true,
      liftgate: true,
      itemsHash: freightItemsHash([...items].reverse()),
    });
    expect(payload.destinationAddressHash).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(JSON.stringify(payload)).not.toContain("Main Street");
  });

  it("preserves a valid signed zero-dollar free-freight quote", () => {
    const token = createFreightQuoteToken({
      totalCents: 0,
      merchandiseSubtotalCents: 500000,
      deliveryAddress,
      residential: false,
      liftgate: false,
      items,
    });

    expect(verifyFreightQuoteToken(token)).toMatchObject({
      totalCents: 0,
      merchandiseSubtotalCents: 500000,
      destinationZip: "32801",
      itemsHash: freightItemsHash(items),
    });
  });

  it("binds a bundled-free Hardware Resources quote to the hardware shipping policy", () => {
    const token = createFreightQuoteToken({
      totalCents: 0,
      merchandiseSubtotalCents: 500000,
      deliveryAddress,
      residential: false,
      liftgate: false,
      quoteKind: "hardware",
      hardwareShippingMode: "bundled_free",
      items: [{ vendorProductId: 55, qty: 56 }],
    });

    expect(verifyFreightQuoteToken(token)).toMatchObject({
      totalCents: 0,
      quoteKind: "hardware",
      hardwareShippingMode: "bundled_free",
      itemsHash: freightItemsHash([{ vendorProductId: 55, qty: 56 }]),
    });
  });

  it("rejects tampering and expired quotes", () => {
    const token = createFreightQuoteToken({
      totalCents: 92345,
      merchandiseSubtotalCents: 400000,
      deliveryAddress,
      residential: false,
      liftgate: false,
      items,
    });
    expect(() => verifyFreightQuoteToken(`${token}x`)).toThrow(/invalid/i);

    const expired = createFreightQuoteToken({
      totalCents: 92345,
      merchandiseSubtotalCents: 400000,
      deliveryAddress,
      residential: false,
      liftgate: false,
      items,
      ttlMs: -1,
    });
    expect(() => verifyFreightQuoteToken(expired)).toThrow(/expired/i);
  });
});
