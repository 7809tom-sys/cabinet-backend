import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/routers/freight.ts"), "utf8");

describe("Worldwide Freight live test class normalization", () => {
  it("normalizes the administrative live-test class through the same WWEX allow-list", () => {
    expect(source).toContain('row.liveProvider === "worldwideexpress"');
    expect(source).toContain('normalizeSpeedshipFreightClass(row.freightClass) ?? "175"');
  });
});
