import { describe, expect, it } from "vitest";
import {
  addStudioBay, canStageStudioPart, createStudioDesign, createStudioReviewDemo, MODE_RECOMMENDATIONS, moveStudioItem,
  restoreStudioDesign, snapStudioPart, STUDIO_FINISHES, studioCollision, studioTakeoff, studioWidth,
  type StudioDesign,
} from "./vendorClosetStudio";
import { CLOSET_PARTS } from "./closet";

describe("isolated vendor Closet Studio", () => {
  it("starts with one bay, sourced panels, two fixed shelves and cleat first, outside checkout", () => {
    const design = createStudioDesign();
    expect(design.bays).toHaveLength(1);
    expect(studioWidth(design)).toBe(25.5);
    const bill = studioTakeoff(design);
    expect(bill.lines[0].section).toBe("cleat");
    expect(bill.lines.filter((line) => line.section === "panel").map((line) => line.sku)).toEqual(["432136", "432525"]);
    expect(bill.lines.some((line) => line.sku === "432529" && line.qty === 2)).toBe(true);
    expect(bill.lines.some((line) => line.sku === "432535" && line.qty === 1)).toBe(true);
    expect(bill.lines.every((line) => CLOSET_PARTS.some((part) => part.sku === line.sku && part.listEachUsd >= 0))).toBe(true);
    expect(bill.missing.some((line) => line.includes("fasteners"))).toBe(true);
  });

  it("adds a neighboring tower and prices exactly one shared center upright, not two end panels", () => {
    const first = createStudioDesign();
    const result = addStudioBay(first);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(studioWidth(result.design)).toBe(50.25);
    const panels = studioTakeoff(result.design).lines.filter((line) => line.section === "panel");
    expect(panels.map((line) => line.sku)).toEqual(["432136", "432519", "432525"]);
    expect(panels.reduce((sum, line) => sum + line.qty, 0)).toBe(3);
    expect(studioTakeoff(result.design).lines.find((line) => line.sku === "432608")?.qty).toBe(2);
    expect(first.bays).toHaveLength(1);
  });

  it("snaps a sourced shoe and rod into the target bay and tallies two cups per rod by pack", () => {
    let design = createStudioDesign();
    const neighbor = addStudioBay(design);
    if (!neighbor.ok) throw new Error(neighbor.reason);
    design = neighbor.design;
    const shoe = snapStudioPart(design, 1, "shoe", 40, "shoe-1");
    expect(shoe.ok).toBe(true);
    if (!shoe.ok) return;
    expect(shoe.design.bays[0].items).toEqual(design.bays[0].items);
    const rod = snapStudioPart(shoe.design, 1, "rod", 64, "rod-1");
    expect(rod.ok).toBe(true);
    if (!rod.ok) return;
    const bill = studioTakeoff(rod.design);
    expect(bill.lines.some((line) => /Shoe Shelf/.test(line.label))).toBe(true);
    expect(bill.lines.find((line) => /Rod Cup/.test(line.label))?.packNote).toContain("2 cups required");
    expect(restoreStudioDesign(JSON.stringify(rod.design))).toEqual(rod.design);
  });

  it("rejects overlapping slides and unsupported baskets without silently altering the design", () => {
    const first = createStudioDesign();
    const collision = studioCollision(first, 0, { id: "new", kind: "drawer", bottomIn: 38 });
    expect(collision).toContain("intersects");
    const failed = moveStudioItem(first, 0, "shelf-1", 6);
    expect(failed.ok).toBe(false);
    expect(first.bays[0].items[0].bottomIn).toBe(38);
    expect(canStageStudioPart(first, 0, "drawer")).toBeNull();
    expect(restoreStudioDesign(JSON.stringify({ ...first, bays: [{ ...first.bays[0], items: [{ id: "basket", kind: "basket", bottomIn: 30 }] }] }))).toBeNull();
  });

  it("hanging start lists the sourced cleat before real 80-inch hanging panels and flags unknown anchors", () => {
    const hanging: StudioDesign = { ...createStudioDesign(), mount: "hanging" };
    const bill = studioTakeoff(hanging);
    expect(bill.lines[0].sku).toBe("432608");
    expect(bill.lines.filter((line) => line.section === "panel").map((line) => line.sku)).toEqual(["432135", "432524"]);
    expect(bill.missing.some((line) => line.includes("Hanging-panel installation"))).toBe(true);
  });

  it("changes recommendations by mode without making any sourced SKU artificially exclusive", () => {
    const pantry = { ...createStudioDesign(), mode: "pantry" as const };
    expect(MODE_RECOMMENDATIONS.pantry[0]).toBe("shelf");
    expect(snapStudioPart(pantry, 0, "rod", 65, "pantry-rod").ok).toBe(true);
    expect(MODE_RECOMMENDATIONS.mudroom).toContain("shoe");
  });

  it("resolves all offered finish, bay-width and mount combinations to public structural SKUs", () => {
    for (const finish of STUDIO_FINISHES) for (const mount of ["floor", "hanging"] as const) for (const widthIn of [18, 24, 30] as const) {
      const base = createStudioDesign();
      const design: StudioDesign = { ...base, finish, mount, bays: [{ id: "source-check", widthIn, items: [] }] };
      const bill = studioTakeoff(design);
      expect(bill.lines.filter((line) => line.section === "panel").reduce((sum, line) => sum + line.qty, 0)).toBe(2);
      expect(bill.lines.filter((line) => line.section === "shelf").reduce((sum, line) => sum + line.qty, 0)).toBe(2);
      expect(bill.lines.filter((line) => line.section === "cleat").reduce((sum, line) => sum + line.qty, 0)).toBe(1);
      expect(bill.missing.filter((line) => line.includes("SKU or exact assembly"))).toEqual([]);
    }
  });

  it("opens the exact mixed sample with a finish-matched MasterTrac slab front and the real drawer box", () => {
    const demo = createStudioReviewDemo();
    expect(demo.finish).toBe("Spiced Mahogany");
    expect(demo.bays).toHaveLength(2);
    expect(demo.bays[1].items.map((item) => item.kind)).toEqual(["shoe", "rod", "drawer"]);
    const lines = studioTakeoff(demo).lines;
    expect(lines.find((line) => line.sku === "432798")?.label).toContain("Small Slab Drawer Front · Spiced Mahogany");
    expect(lines.find((line) => line.sku === "432385")?.label).toContain("Small Drawer w/SC slides · Hard Maple");
    expect(lines.some((line) => line.section === "panel" && line.qty > 1)).toBe(false);
  });
});
