import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cartSource = readFileSync(resolve(process.cwd(), "client/src/pages/Cart.tsx"), "utf8");
const builderSource = readFileSync(resolve(process.cwd(), "client/src/pages/OrderBuilder.tsx"), "utf8");
const reviewSource = readFileSync(resolve(process.cwd(), "client/src/components/order/OrderReview.tsx"), "utf8");

describe("cart live freight quoting", () => {
  it("rates eligible cart cabinet items using their exact supplier and style identity", () => {
    expect(cartSource).toContain("const cartFreightItems");
    expect(cartSource).toContain("item.distributorId != null");
    expect(cartSource).toContain("trpc.freight.estimate.useQuery(cartFreightInput");
    expect(cartSource).toContain("distributorId: item.distributorId");
    expect(cartSource).toContain("Get live quote");
  });

  it("shows the live carrier pallet plan instead of a generic shipping estimate", () => {
    expect(cartSource).toContain("shipmentGroups");
    expect(cartSource).toContain("lb contents");
    expect(cartSource).toContain("lb billed");
    expect(cartSource).toContain("Pallet {index + 1}");
  });

  it("preserves the cart supplier selection when the customer continues into Order Review", () => {
    expect(builderSource).toContain("cartDistributorId: cartLine.distributorId ?? null");
    expect(reviewSource).toContain("distributorId: line.cartDistributorId ?? null");
  });
});
