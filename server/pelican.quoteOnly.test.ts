import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function adminCtx(): TrpcContext {
  return {
    user: { id: 1, openId: "pelican-price-audit", name: "Price audit", email: "pricing-audit@example.invalid", role: "admin" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const source = readFileSync(new URL("./routers/pelican.ts", import.meta.url), "utf8");

describe("Pelican quote-only catalog visibility", () => {
  it("permits an active catalog item with an official MSRP reference to be browsed without treating MSRP as a sell-price base", () => {
    expect(source).toContain("hasCatalogPriceOrQuoteReference");
    expect(source).toContain("gt(pelicanProducts.msrp, \"0\")");
    expect(source).toContain("hasPriceData() as any");
  });

  it("uses only exact user-supplied price-list matches and retains unmatched current SKUs as quote-only outside the Designer", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const pricedBases = new Map([
      ["Tigertail 12mil Vinyl Flooring", "45.00"],
      ["Tigertail 20mil Vinyl Flooring", "33.85"],
      ["Madeira 20mil Vinyl Flooring", "33.85"],
    ]);
    const quoteOnlyCodes = ["Sanibel 12mil  Vinyl Flooring", "Madeira Liteback Vinyl Flooring"];
    const codes = [...pricedBases.keys(), ...quoteOnlyCodes];
    const page = await caller.pelican.byCategory({ category: "Flooring", scope: "catalog", search: "Vinyl Flooring", limit: 200, offset: 0 });
    const rows = page.items.filter((item) => codes.includes(item.pelicanCode));
    expect(rows).toHaveLength(codes.length);
    for (const row of rows) {
      expect(row.msrp).not.toBeNull();
      expect(row.showInDesigner).toBe(false);
      expect(row.imageUrl).toMatch(/^\/manus-storage\/pelican\/flooring\//);
      const listPrice = pricedBases.get(row.pelicanCode);
      if (listPrice) {
        expect(row.listPrice).toBe(listPrice);
        expect(row.sellPrice).toBeGreaterThan(0);
      } else {
        expect(row.listPrice).toBeNull();
        expect(row.sellPrice).toBeNull();
      }
    }
  });

  it("returns quote-only current flooring SKUs in the admin Needs source price filter even when both price fields are null", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const page = await caller.pelican.adminList({
      category: "Flooring",
      search: "Sanibel 12mil  Vinyl Flooring",
      unpricedOnly: true,
      limit: 20,
      offset: 0,
    });
    const row = page.items.find((item) => item.pelicanCode === "Sanibel 12mil  Vinyl Flooring");
    expect(row).toMatchObject({
      listPrice: null,
      yourCost: null,
      showInCatalog: true,
      showInDesigner: false,
    });
    expect(Number(row?.msrp)).toBeGreaterThan(0);
  });
});
