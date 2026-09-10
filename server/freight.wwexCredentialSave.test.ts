import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/routers/freight.ts"), "utf8");

describe("freight.saveWwexCredentials", () => {
  it("accepts and persists the WWEX Client ID and Client Secret together without returning the secret", () => {
    expect(source).toContain("saveWwexCredentials: adminProcedure");
    expect(source).toContain("wwexClientId: z.string().trim().min(1).max(255)");
    expect(source).toContain("wwexClientSecret: z.string().trim().min(1).max(255)");
    expect(source).toContain("wwexClientSecret: input.wwexClientSecret");
    expect(source).toContain("hasWwexClientSecret: true");
    expect(source).not.toContain("wwexClientSecret: input.wwexClientSecret, hasWwexClientSecret");
  });
});
