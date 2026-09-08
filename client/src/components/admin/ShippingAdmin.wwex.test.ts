import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "client/src/components/admin/ShippingAdmin.tsx"),
  "utf8",
);

describe("ShippingAdmin WWEX verification controls", () => {
  it("stores separate verified token and rate URLs for sandbox and production", () => {
    expect(source).toContain("wwexSandboxTokenUrl");
    expect(source).toContain("wwexSandboxRateUrl");
    expect(source).toContain("wwexProductionTokenUrl");
    expect(source).toContain("wwexProductionRateUrl");
    expect(source).toContain("environment-specific token and rate URLs");
  });

  it("never claims a guessed endpoint and explains the HTTPS safety rule", () => {
    expect(source).toContain("will not send credentials to guessed or non-HTTPS hosts");
    expect(source).not.toContain("https://api-sandbox.wwex.com");
    expect(source).not.toContain("https://api.wwex.com");
  });
});
