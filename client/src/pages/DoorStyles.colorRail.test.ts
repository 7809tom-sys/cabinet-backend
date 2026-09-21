import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DoorStyles.tsx"), "utf8");

describe("Door Styles color rail", () => {
  it("places the six-door color slider above the existing featured cabinet cards", () => {
    expect(source).toContain("Cabinet color line");
    expect(source).toContain("Choose a door color first");
    expect(source).toContain("six door samples at a time");
    expect(source).toContain("Featured cabinet cards remain below the color line.");
    expect(source.indexOf("Cabinet color line")).toBeLessThan(source.indexOf('t("ds_featured")'));
  });

  it("uses every active Door Styles record rather than only the editor picks", () => {
    expect(source).toContain("orderDoorStylesByColor(uniqueStyles)");
    expect(source).toContain("complete active, sellable door-color catalogue");
    expect(source).toContain("active cabinet door colors");
    expect(source).not.toContain("orderDoorStylesByColor(featured)");
  });

  it("uses the color line as the only color browsing control", () => {
    expect(source).not.toContain("COLOR_BUCKETS");
    expect(source).not.toContain("selectedColor");
    expect(source).not.toContain("All Colors");
    expect(source).toContain("Choose a door color first");
  });

  it("keeps the public style selector to Shaker, Slab, Slim, and Raised only", () => {
    expect(source).toContain('const SIMPLE_DOOR_STYLES: Array<{ key: SimpleDoorStyle; label: string }>');
    expect(source).toContain('{ key: "shaker", label: "Shaker" }');
    expect(source).toContain('{ key: "slab", label: "Slab" }');
    expect(source).toContain('{ key: "slim", label: "Slim" }');
    expect(source).toContain('{ key: "raised", label: "Raised" }');
    expect(source).not.toContain("FRAME_BUCKETS");
    expect(source).not.toContain("All Frames");
  });

  it("gives the active style a high-contrast gold fill and bold double outline", () => {
    expect(source).toContain('aria-label="Door style filter"');
    expect(source).toContain("aria-pressed={selectedType === style.key}");
    expect(source).toContain("border-[3px] border-[#0f1f3d] bg-[#d4a75a] font-extrabold");
    expect(source).toContain("shadow-[0_0_0_3px_rgba(212,167,90,0.3)] ring-2 ring-[#d4a75a] ring-offset-2");
  });

  it("uses the shared light-to-deep ordering and safe directional slider controls", () => {
    expect(source).toContain("DOOR_COLOR_SPECTRUM_PAGE_SIZE");
    expect(source).toContain("AnimatePresence");
    expect(source).toContain("moveColorRail");
    expect(source).toContain("useReducedMotion");
    expect(source).toContain("Show next six cabinet colors");
  });
});
