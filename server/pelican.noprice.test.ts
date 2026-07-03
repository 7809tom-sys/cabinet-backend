import { describe, it, expect } from "vitest";

/**
 * Validates that products with zero/null cost are excluded from public queries.
 * The `hasPriceData()` SQL filter in pelican.ts ensures only products with
 * yourCost > 0 OR listPrice > 0 appear in public-facing endpoints.
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
  it("byCategory excludes products with zero listPrice and null yourCost", async () => {
    const data = await trpcGet("pelican.byCategory", {
      category: "Sinks & Faucets",
      scope: "catalog",
      limit: 200,
    });
    const items = data?.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    // No item should have a null or zero sellPrice
    const unpriced = items.filter(
      (i: any) => i.sellPrice === null || i.sellPrice === 0
    );
    expect(unpriced).toHaveLength(0);
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

  it("bySlug returns null for a zero-price product", async () => {
    // "25mm-replacement-ceramic-cartridge" has listPrice=0.00, yourCost=null
    const data = await trpcGet("pelican.bySlug", {
      slug: "25mm-replacement-ceramic-cartridge",
    });
    expect(data).toBeNull();
  });
});
