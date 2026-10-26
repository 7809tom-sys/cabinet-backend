import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers/affiliates.ts", import.meta.url), "utf8");
const privacy = readFileSync(new URL("./lib/affiliatePrivacy.ts", import.meta.url), "utf8");
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

  it("publishes only opt-in contact fields and never the login email or private phone", () => {
    expect(privacy).toContain("publicEmail: a.publicEmail");
    expect(privacy).toContain("publicPhone: a.publicPhone");
    expect(privacy).toContain("publicAddress: a.publicAddress");
    expect(privacy).toContain('"contactName", "email", "phone"');
    expect(storefront).toContain("const storefrontEmail = data.publicEmail");
    expect(storefront).toContain("const storefrontPhone = data.publicPhone");
    expect(storefront).not.toContain("data.email");
    expect(storefront).not.toContain("data.phone");
    expect(storefront).toContain("const storefrontLocation = data.publicAddress || data.serviceArea || data.location");
  });
});
