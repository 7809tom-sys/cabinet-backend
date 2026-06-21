import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { resolvePresentation } from "./lib/presentation";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// Real supplier brand strings that must NEVER appear in any public-facing API response.
const FORBIDDEN_BRANDS = [
  "US Cabinet Depot",
  "Clark & Son",
  "Clark and Son",
  "Skyline",
];

function assertNoBrandLeak(payload: unknown) {
  const blob = JSON.stringify(payload ?? null);
  for (const brand of FORBIDDEN_BRANDS) {
    expect(blob.includes(brand)).toBe(false);
  }
}

describe("white-label model: public APIs never leak a hidden supplier brand", () => {
  it("storefront.families carries no real supplier brand", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const families = await caller.storefront.families();
    assertNoBrandLeak(families);
  });

  it("storefront.familyCatalog (full scan) carries no real supplier brand", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const families = await caller.storefront.families();
    if (!families.length) return;
    const styleId = families[0].styleId;
    const res = await caller.storefront.familyCatalog({ styleId, limit: 200 });
    assertNoBrandLeak(res);
    // explicit field-level guard: scrubbed internal-only fields are absent
    for (const it of res.items as Array<Record<string, unknown>>) {
      expect(it).not.toHaveProperty("descriptionSource");
      expect(it).not.toHaveProperty("distributorName");
      expect(it).not.toHaveProperty("brandName");
    }
  });
});

describe("resolvePresentation never reveals a brand for a white-labeled neutral line", () => {
  it("returns the neutral label when whiteLabel=true even if a brand is stored", () => {
    const r = resolvePresentation({
      name: "Line A",
      initials: "A",
      brandName: "US Cabinet Depot",
      brandInitials: "UCD",
      whiteLabel: true,
      displayMode: "neutral",
    });
    expect(r.displayName).toBe("Line A");
    expect(r.displayInitials).toBe("A");
    expect(r.displayName).not.toContain("Cabinet Depot");
  });

  it("does not reveal brand when displayMode=branded but the line is still white-labeled", () => {
    const r = resolvePresentation({
      name: "Line B",
      initials: "B",
      brandName: "Clark & Son",
      whiteLabel: true,
      displayMode: "branded",
    });
    expect(r.displayName).toBe("Line B");
    expect(r.displayName).not.toContain("Clark");
  });

  it("reveals the brand only when explicitly branded AND not white-labeled", () => {
    const r = resolvePresentation({
      name: "Line C",
      initials: "C",
      brandName: "Skyline",
      brandInitials: "SK",
      whiteLabel: false,
      displayMode: "branded",
    });
    expect(r.displayName).toBe("Skyline");
    expect(r.displayInitials).toBe("SK");
  });

  it("uses a Cabinet Dealz series name (not the supplier brand) in series mode", () => {
    const r = resolvePresentation({
      name: "Line A",
      initials: "A",
      brandName: "US Cabinet Depot",
      whiteLabel: true,
      displayMode: "series",
      seriesName: "Cabinet Dealz Elegant Series",
      markupPercent: 0.15,
    });
    expect(r.displayName).toBe("Cabinet Dealz Elegant Series");
    expect(r.displayName).not.toContain("Cabinet Depot");
    expect(r.markup).toBeCloseTo(1.15, 5);
  });
});
