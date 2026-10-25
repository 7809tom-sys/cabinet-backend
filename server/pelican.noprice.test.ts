import { describe, it, expect } from "vitest";

/**
 * Validates that products without an authorized sell-price base never enter the
 * Designer or cart. A current official SKU with an MSRP reference may appear in
 * the public catalog as quote-only so it is not silently hidden.
 *
 * These tests call the live tRPC endpoints to verify the filter works end-to-end.
 */

const BASE = "http://localhost:3000/api/trpc";

async function trpcGet(path: string, input: Record<string, unknown>) {
  const encoded = encodeURIComponent(JSON.stringify({ json: input }));
  const res = await fetch(`${BASE}/${path}?input=${encoded}`);
  const body = await res.json();
  const data = body?.result?.data;
  // superjson wraps in { json: ... }; unwrap if present
  if (data && typeof data === "object" && "json" in data) return data.json;
  return data;
}

describe("pelican price filtering", () => {
  it("byCategory returns priceable products and may retain quote-only official source records", async () => {
    const data = await trpcGet("pelican.byCategory", {
      category: "Sinks & Faucets",
      scope: "catalog",
      limit: 200,
    });
    const items = data?.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      if (item.sellPrice == null) expect(Number(item.msrp)).toBeGreaterThan(0);
      else expect(item.sellPrice).toBeGreaterThan(0);
    }
  });

  it("byCategory total count excludes unpriced items (Toilets & Bidets had 58, now 28)", async () => {
    const data = await trpcGet("pelican.byCategory", {
      category: "Toilets & Bidets",
      scope: "catalog",
      limit: 100,
    });
    // Previously 58 total, now should be ~28 after filtering 30 zero-price items
    expect(data?.total).toBeLessThan(58);
    expect(data?.total).toBeGreaterThan(0);
  });

  it("categories endpoint counts exclude unpriced items", async () => {
    const data = await trpcGet("pelican.categories", { scope: "catalog" });
    const sinks = (data as any[])?.find(
      (c: any) => c.category === "Sinks & Faucets"
    );
    // Was 611, should now be ~582 (minus 24+ zero-price accessories)
    expect(sinks).toBeDefined();
    expect(sinks.count).toBeLessThan(611);
    expect(sinks.count).toBeGreaterThan(500);
  });

  it("bySlug returns null for an unpriced product with no quote reference", async () => {
    // "25mm-replacement-ceramic-cartridge" has listPrice=0.00, yourCost=null
    const data = await trpcGet("pelican.bySlug", {
      slug: "25mm-replacement-ceramic-cartridge",
    });
    expect(data).toBeNull();
  });
});
