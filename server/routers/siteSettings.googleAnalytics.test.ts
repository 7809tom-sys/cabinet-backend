import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { googleAnalyticsMeasurementIdSchema } from "../../shared/googleAnalytics";

const routerSource = readFileSync(new URL("./siteSettings.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../../drizzle/schema.ts", import.meta.url), "utf8");

describe("site settings Google Analytics contract", () => {
  it("accepts a valid GA4 Measurement ID or an explicit empty value for removal", () => {
    expect(googleAnalyticsMeasurementIdSchema.parse(" g-PSW1MY7HB4 ")).toBe("G-PSW1MY7HB4");
    expect(googleAnalyticsMeasurementIdSchema.parse("")).toBeNull();
    expect(() => googleAnalyticsMeasurementIdSchema.parse("UA-12345-1")).toThrow();
  });

  it("stores the GA4 ID with site settings and exposes an admin-only update mutation", () => {
    expect(schemaSource).toContain('googleAnalyticsMeasurementId: varchar("googleAnalyticsMeasurementId", { length: 32 })');
    expect(routerSource).toContain("updateGoogleAnalytics: protectedProcedure");
    expect(routerSource).toContain("googleAnalyticsMeasurementId: googleAnalyticsMeasurementIdSchema");
    expect(routerSource).toContain('ctx.user.role !== "admin"');
    expect(routerSource).toContain("googleAnalyticsMeasurementId: input.googleAnalyticsMeasurementId");
  });
});
