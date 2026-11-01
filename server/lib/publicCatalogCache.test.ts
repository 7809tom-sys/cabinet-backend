import { afterEach, describe, expect, it } from "vitest";
import {
  PUBLIC_CATALOG_CACHE_CONTROL,
  cachedPublicCatalog,
  enablePublicCatalogCacheForTests,
  invalidatePublicCatalogCache,
  publicCatalogInputIsCacheable,
  publicCatalogResponseHeaders,
  resetPublicCatalogCache,
  stablePublicCatalogKey,
} from "./publicCatalogCache";

describe("public catalog cache", () => {
  afterEach(() => {
    resetPublicCatalogCache();
    enablePublicCatalogCacheForTests(false);
  });

  it("reuses a result for the same procedure and input, and isolates a different input", async () => {
    enablePublicCatalogCacheForTests(true);
    let calls = 0;
    const load = async () => {
      calls += 1;
      return { items: ["tile"], calls };
    };
    const first = await cachedPublicCatalog({
      procedure: "pelican.byCategory",
      input: { category: "Tile & Mosaic", scope: "catalog" },
      tags: ["pelican"],
      load,
    });
    const second = await cachedPublicCatalog({
      procedure: "pelican.byCategory",
      input: { scope: "catalog", category: "Tile & Mosaic" },
      tags: ["pelican"],
      load,
    });
    const other = await cachedPublicCatalog({
      procedure: "pelican.byCategory",
      input: { category: "Flooring", scope: "catalog" },
      tags: ["pelican"],
      load,
    });
    expect(calls).toBe(2);
    expect(second).toEqual(first);
    expect(other.items).toEqual(["tile"]);
    expect(stablePublicCatalogKey("pelican.byCategory", { b: 1, a: 2 }))
      .toBe(stablePublicCatalogKey("pelican.byCategory", { a: 2, b: 1 }));
  });

  it("does not let a caller mutate the stored result", async () => {
    enablePublicCatalogCacheForTests(true);
    const load = async () => ({ items: ["tile"] });
    const first = await cachedPublicCatalog({
      procedure: "pelican.byCategory",
      input: { category: "Tile & Mosaic" },
      tags: ["pelican"],
      load,
    });
    first.items.push("changed");
    const second = await cachedPublicCatalog({
      procedure: "pelican.byCategory",
      input: { category: "Tile & Mosaic" },
      tags: ["pelican"],
      load,
    });
    expect(second.items).toEqual(["tile"]);
  });

  it("drops an entry when its tag is invalidated or its TTL passes", async () => {
    enablePublicCatalogCacheForTests(true);
    let value = "first";
    const load = async () => value;
    await cachedPublicCatalog({
      procedure: "doorStyles.featured",
      input: null,
      tags: ["door-styles"],
      ttlMs: 1_000,
      now: 1_000,
      load,
    });
    invalidatePublicCatalogCache(["pelican"]);
    value = "still-cached";
    expect(await cachedPublicCatalog({
      procedure: "doorStyles.featured",
      input: null,
      tags: ["door-styles"],
      ttlMs: 1_000,
      now: 1_500,
      load,
    })).toBe("first");
    invalidatePublicCatalogCache(["door-styles"]);
    value = "fresh";
    expect(await cachedPublicCatalog({
      procedure: "doorStyles.featured",
      input: null,
      tags: ["door-styles"],
      ttlMs: 1_000,
      now: 1_500,
      load,
    })).toBe("fresh");
    value = "expired";
    expect(await cachedPublicCatalog({
      procedure: "doorStyles.featured",
      input: null,
      tags: ["door-styles"],
      ttlMs: 1_000,
      now: 3_000,
      load,
    })).toBe("expired");
  });

  it("does not store a search or an admin-scoped read", async () => {
    enablePublicCatalogCacheForTests(true);
    expect(publicCatalogInputIsCacheable({ search: "  sink " })).toBe(false);
    expect(publicCatalogInputIsCacheable({ scope: "admin" })).toBe(false);
    let calls = 0;
    const load = async () => {
      calls += 1;
      return calls;
    };
    expect(await cachedPublicCatalog({ procedure: "cabinets.list", input: { search: "W2430" }, tags: ["cabinets"], load })).toBe(1);
    expect(await cachedPublicCatalog({ procedure: "cabinets.list", input: { search: "W2430" }, tags: ["cabinets"], load })).toBe(2);
  });

  it("sets a shared GET cache only for one anonymous public catalog procedure", () => {
    const headers = publicCatalogResponseHeaders({
      method: "GET",
      paths: ["pelican.byCategory"],
      type: "query",
      errors: [],
      authorization: undefined,
      testAccount: undefined,
      serverTiming: 'catalog;dur=12;desc="hit"',
    });
    expect(headers).toMatchObject({
      "Cache-Control": PUBLIC_CATALOG_CACHE_CONTROL,
      Vary: "trpc-accept, Authorization",
      "Server-Timing": 'catalog;dur=12;desc="hit"',
    });
    expect(publicCatalogResponseHeaders({
      method: "POST",
      paths: ["pelican.byCategory"],
      type: "query",
      errors: [],
      authorization: undefined,
      testAccount: undefined,
    })).toBeUndefined();
    expect(publicCatalogResponseHeaders({
      method: "GET",
      paths: ["pelican.byCategory", "auth.me"],
      type: "query",
      errors: [],
      authorization: undefined,
      testAccount: undefined,
    })).toBeUndefined();
    expect(publicCatalogResponseHeaders({
      method: "GET",
      paths: ["auth.me"],
      type: "query",
      errors: [],
      authorization: undefined,
      testAccount: undefined,
    })).toBeUndefined();
    expect(publicCatalogResponseHeaders({
      method: "GET",
      paths: ["pelican.byCategory"],
      type: "query",
      errors: [],
      authorization: "Bearer secret",
      testAccount: undefined,
    })).toBeUndefined();
    expect(publicCatalogResponseHeaders({
      method: "GET",
      paths: ["orders.list"],
      type: "query",
      errors: [],
      authorization: undefined,
      testAccount: undefined,
    })).toBeUndefined();
    expect(publicCatalogResponseHeaders({
      method: "GET",
      paths: ["pelican.byCategory"],
      type: "query",
      errors: [],
      eagerGeneration: true,
      authorization: undefined,
      testAccount: undefined,
    })).toBeUndefined();
  });

  it("a parallel catalog read waits once where five sequential reads wait five times", async () => {
    const queryMs = 40;
    const query = () => new Promise((resolve) => setTimeout(resolve, queryMs));
    const sequentialStart = Date.now();
    for (let i = 0; i < 5; i += 1) await query();
    const sequential = Date.now() - sequentialStart;
    const parallelStart = Date.now();
    await Promise.all([query(), query(), query(), query(), query()]);
    const parallel = Date.now() - parallelStart;
    expect(sequential).toBeGreaterThan(queryMs * 4);
    expect(parallel).toBeLessThan(sequential / 2);
  });
});
