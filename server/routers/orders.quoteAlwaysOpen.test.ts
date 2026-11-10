import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const orders = readFileSync(new URL("./orders.ts", import.meta.url), "utf8");

describe("affiliate cart and quote requests", () => {
  it("does not let the quote publish switch reject cart pricing or a quote request", () => {
    expect(orders).not.toContain('feature: "quote"');
    expect(orders).not.toContain("guardAffiliateFeature");
  });
});
