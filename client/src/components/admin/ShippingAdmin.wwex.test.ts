import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "client/src/components/admin/ShippingAdmin.tsx"),
  "utf8",
);

describe("ShippingAdmin WWEX verification controls", () => {
  it("provides a dedicated save action for the Client ID and Client Secret with clear safe-save feedback", () => {
    expect(source).toContain("saveWwexCredentials");
    expect(source).toContain("Save WWEX credentials");
    expect(source).toContain("WWEX Client ID and Client Secret saved.");
    expect(source).toContain("The secret is intentionally cleared from this screen after saving.");
  });

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
