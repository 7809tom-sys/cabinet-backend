import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DesignTool.tsx"), "utf8");

describe("DesignTool saved-design ownership loading", () => {
  it("does not issue a direct saved-plan request until the active session is authenticated", () => {
    expect(source).toContain("const { user, isAuthenticated } = useAuth();");
    expect(source).toContain("enabled: currentSavedDesignId != null && verified && isAuthenticated");
  });
});
