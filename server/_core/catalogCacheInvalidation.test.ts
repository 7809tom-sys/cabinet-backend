import { describe, expect, it, afterEach } from "vitest";
import { adminProcedure, router } from "./trpc";
import {
  cachedPublicCatalog,
  enablePublicCatalogCacheForTests,
  resetPublicCatalogCache,
} from "../lib/publicCatalogCache";

const probe = router({
  touch: adminProcedure.mutation(() => ({ saved: true })),
});

describe("catalog cache invalidation", () => {
  afterEach(() => {
    resetPublicCatalogCache();
    enablePublicCatalogCacheForTests(false);
  });

  it("clears public catalog entries after a successful admin mutation", async () => {
    enablePublicCatalogCacheForTests(true);
    let calls = 0;
    await cachedPublicCatalog({
      procedure: "pelican.byCategory",
      input: { category: "Tile & Mosaic" },
      tags: ["pelican"],
      load: async () => {
        calls += 1;
        return calls;
      },
    });
    await probe.createCaller({
      user: { role: "admin" },
      req: { headers: {} },
      res: {},
    } as never).touch();
    const again = await cachedPublicCatalog({
      procedure: "pelican.byCategory",
      input: { category: "Tile & Mosaic" },
      tags: ["pelican"],
      load: async () => {
        calls += 1;
        return calls;
      },
    });
    expect(again).toBe(2);
  });

  it("keeps the cached catalog when an admin read does not write", async () => {
    enablePublicCatalogCacheForTests(true);
    const readOnly = router({
      look: adminProcedure.query(() => ({ ok: true })),
    });
    await cachedPublicCatalog({
      procedure: "doorStyles.featured",
      input: null,
      tags: ["door-styles"],
      load: async () => "featured",
    });
    await readOnly.createCaller({
      user: { role: "admin" },
      req: { headers: {} },
      res: {},
    } as never).look();
    let calls = 0;
    const value = await cachedPublicCatalog({
      procedure: "doorStyles.featured",
      input: null,
      tags: ["door-styles"],
      load: async () => {
        calls += 1;
        return "replaced";
      },
    });
    expect(value).toBe("featured");
    expect(calls).toBe(0);
  });

  it("keeps the cached catalog when an admin mutation fails", async () => {
    enablePublicCatalogCacheForTests(true);
    const failing = router({
      boom: adminProcedure.mutation(() => {
        throw new Error("nope");
      }),
    });
    await cachedPublicCatalog({
      procedure: "pageContent.getAll",
      input: null,
      tags: ["page-content"],
      load: async () => "copy",
    });
    await expect(failing.createCaller({
      user: { role: "admin" },
      req: { headers: {} },
      res: {},
    } as never).boom()).rejects.toThrow("nope");
    let calls = 0;
    const value = await cachedPublicCatalog({
      procedure: "pageContent.getAll",
      input: null,
      tags: ["page-content"],
      load: async () => {
        calls += 1;
        return "replaced";
      },
    });
    expect(value).toBe("copy");
    expect(calls).toBe(0);
  });
});
