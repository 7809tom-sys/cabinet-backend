import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/routers/freight.ts"), "utf8");

describe("freight.saveUpsCredentials", () => {
  it("persists the UPS OAuth credential set without returning the secret", () => {
    expect(source).toContain("saveUpsCredentials: adminProcedure");
    expect(source).toContain("upsClientId: z.string().trim().min(1).max(255)");
    expect(source).toContain("upsClientSecret: z.string().trim().min(1).max(255)");
    expect(source).toContain("upsAccountNumber: z.string().trim().min(1).max(64)");
    expect(source).toContain("upsClientSecret: input.upsClientSecret");
    expect(source).toContain("hasUpsClientSecret: true");
    expect(source).not.toContain("upsClientSecret: input.upsClientSecret, hasUpsClientSecret");
  });

  it("keeps direct UPS parcel-only and requires the shared eligibility gate", () => {
    expect(source).toContain("Direct UPS is intentionally parcel-only");
    expect(source).toContain('parcelDecision.eligibleCarriers.includes("ups")');
    expect(source).toContain("Direct UPS rating requires verified city/state data");
    expect(source).not.toContain("invent carton data to force a quote");
  });
});
