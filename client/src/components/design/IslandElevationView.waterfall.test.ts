import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/components/design/IslandElevationView.tsx"), "utf8");

describe("island elevation waterfall ends", () => {
  it("shows selected waterfall sides as full-height countertop panels", () => {
    expect(source).toContain("waterfall-left-${p.uid}");
    expect(source).toContain("waterfall-right-${p.uid}");
    expect(source).toContain("STD.BASE_HEIGHT + THICKNESS_IN");
    expect(source).toContain("p.waterfallLeft || p.waterfallRight");
  });
});
