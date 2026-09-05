import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Designer Compact Workspace", () => {
  it("automatically converts desktop sidebars into drawers on small laptop widths", () => {
    expect(source).toContain("const isSmallLaptop = useIsMobile(1440)");
    expect(source).toContain("const panelDrawerMode = isMobile || isCompactWorkspace");
    expect(source).toContain("isMobile={panelDrawerMode}");
  });

  it("keeps manual canvas, catalog, and price controls available in compact mode", () => {
    expect(source).toContain("Compact workspace");
    expect(source).toContain("Full workspace");
    expect(source).toContain("> Catalog");
    expect(source).toContain("Price &amp; cart");
  });
});
