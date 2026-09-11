import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const storefront = readFileSync(resolve(process.cwd(), "client/src/pages/Storefront.tsx"), "utf8");

describe("affiliate storefront refresh recovery", () => {
  it("retries transient public storefront data requests instead of failing after one refresh-time request", () => {
    expect(storefront).toContain("retry: 2");
    expect(storefront).toContain("retryDelay: (attempt) => Math.min(750 * 2 ** attempt, 3_000)");
    expect(storefront).toContain("refetchOnWindowFocus: false");
    expect(storefront).not.toContain("retry: false");
  });

  it("keeps the delayed or failed refresh white-label and gives customers a direct retry action", () => {
    expect(storefront).toContain("function StorefrontRefreshState");
    expect(storefront).toContain("Loading {storeName}");
    expect(storefront).toContain("Refreshing your cabinet storefront and current selections.");
    expect(storefront).toContain("Retry storefront");
    expect(storefront).toContain("void refetch()");
    expect(storefront).toContain("if (isLoading || isError)");
  });
});
