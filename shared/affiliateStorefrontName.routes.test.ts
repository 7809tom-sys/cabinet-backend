import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RESERVED_STOREFRONT_SLUGS, checkStorefrontName } from "./affiliateStorefrontName";

/**
 * The reserved list is the only thing keeping a storefront from taking a name
 * the platform already routes, and it is maintained by hand. This reads the real
 * route table so a new top-level page cannot quietly become a claimable name.
 */
const APP_SOURCE = readFileSync(
  path.resolve(import.meta.dirname, "../client/src/App.tsx"),
  "utf8",
);

/** First path segment of every top-level route in the SPA (`/store/:slug` has more). */
function topLevelRoutes(): string[] {
  const segments = new Set<string>();
  for (const match of APP_SOURCE.matchAll(/path="\/([a-z0-9-]+)(?:\/[^"]*)?"/g)) {
    segments.add(match[1]);
  }
  return Array.from(segments).sort();
}

describe("reserved storefront names", () => {
  it("refuses every top-level route the app actually registers", () => {
    const routes = topLevelRoutes();
    expect(routes.length).toBeGreaterThan(30);
    const claimable = routes.filter((route) => checkStorefrontName(route).ok);
    expect(claimable).toEqual([]);
  });

  it("keeps the platform hostnames out of the namespace", () => {
    for (const host of ["www", "api", "app", "status", "mail"]) {
      expect(RESERVED_STOREFRONT_SLUGS.has(host)).toBe(true);
    }
  });

  it("keeps existing demo and house-brand stores out of the namespace", () => {
    for (const slug of ["sales-demo", "stonecreek", "plumbers-choice", "cabinetdealz"]) {
      expect(RESERVED_STOREFRONT_SLUGS.has(slug)).toBe(true);
    }
    // "firstclass" is a real store, not a reserved word: it is refused because a
    // live affiliate row holds it, which is checked against the database.
    expect(RESERVED_STOREFRONT_SLUGS.has("firstclass")).toBe(false);
  });

  it("does not reserve ordinary brand names", () => {
    for (const name of ["oak-and-iron", "bayside-cabinets", "reaves-way"]) {
      expect(RESERVED_STOREFRONT_SLUGS.has(name)).toBe(false);
      expect(checkStorefrontName(name).ok).toBe(true);
    }
  });
});
