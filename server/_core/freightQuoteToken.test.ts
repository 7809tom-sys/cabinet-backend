import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFreightQuoteToken, freightItemsHash, verifyFreightQuoteToken } from "./freightQuoteToken";

const originalSecret = process.env.JWT_SECRET;

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
      destinationZip: "32801-1234",
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
  });

  it("preserves a valid signed zero-dollar free-freight quote", () => {
    const token = createFreightQuoteToken({
      totalCents: 0,
      merchandiseSubtotalCents: 500000,
      destinationZip: "32801",
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

  it("rejects tampering and expired quotes", () => {
    const token = createFreightQuoteToken({
      totalCents: 92345,
      merchandiseSubtotalCents: 400000,
      destinationZip: "32801",
      residential: false,
      liftgate: false,
      items,
    });
    expect(() => verifyFreightQuoteToken(`${token}x`)).toThrow(/invalid/i);

    const expired = createFreightQuoteToken({
      totalCents: 92345,
      merchandiseSubtotalCents: 400000,
      destinationZip: "32801",
      residential: false,
      liftgate: false,
      items,
      ttlMs: -1,
    });
    expect(() => verifyFreightQuoteToken(expired)).toThrow(/expired/i);
  });
});
