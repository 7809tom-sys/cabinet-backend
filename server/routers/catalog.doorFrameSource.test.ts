import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/routers/catalog.ts"), "utf8");

describe("door frame source citation contract", () => {
  it("returns and saves the source citation with the exact Door Style record", () => {
    expect(source).toContain("sourceSpecification: doorStyles.sourceSpecification");
    expect(source).toContain("sourceSpecification: z.string().max(512).nullable().optional()");
    expect(source).toContain("patch.sourceSpecification = fields.sourceSpecification?.trim() || null");
  });
});
