import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers/affiliates.ts", import.meta.url), "utf8");
const storefront = readFileSync(new URL("../client/src/pages/Storefront.tsx", import.meta.url), "utf8");

describe("affiliate public contact setup", () => {
  it("keeps public storefront contact fields distinct from the affiliate account email", () => {
    expect(schema).toContain('publicEmail: varchar("publicEmail", { length: 320 })');
    expect(schema).toContain('publicPhone: varchar("publicPhone", { length: 32 })');
    expect(schema).toContain('publicAddress: varchar("publicAddress", { length: 256 })');
    expect(router).toContain("publicEmail: z.string().email().max(320).nullable().optional()");
    expect(router).toContain("publicPhone: z.string().max(32).nullable().optional()");
    expect(router).toContain("publicAddress: z.string().max(256).nullable().optional()");
  });

  it("publishes contact details only when the affiliate opts in", () => {
    expect(router).toContain("publicContactForStorefront");
    expect(router).toContain("email: null");
    expect(router).toContain("phone: null");
    expect(storefront).toContain("const storefrontEmail = data.showPublicEmail ? data.publicEmail : null");
    expect(storefront).toContain("const storefrontPhone = data.showPublicPhone ? data.publicPhone : null");
    expect(storefront).not.toContain("data.publicEmail || data.email");
    expect(storefront).not.toContain("data.publicPhone || data.phone");
  });
});
