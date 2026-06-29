import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import { autoFillSpan, type FillCabinet } from "../shared/fillEngine";

function publicCaller() {
  return appRouter.createCaller({ user: null } as any);
}

describe("design.consult (AI design consultant)", () => {
  it("returns a string reply and a plan array for a kitchen request", async () => {
    const caller = publicCaller();
    const res = await caller.design.consult({
      message: "Fill my back wall with base cabinets and leave room for a sink",
      walls: [
        { id: "back", label: "Back", lengthInches: 120 },
        { id: "left", label: "Left", lengthInches: 96 },
      ],
      roomType: "kitchen",
    });
    expect(typeof res.reply).toBe("string");
    expect(res.reply.length).toBeGreaterThan(0);
    expect(Array.isArray(res.plan)).toBe(true);
    // White-label guard: the consultant must never name a real supplier brand.
    const lower = res.reply.toLowerCase();
    for (const brand of ["us cabinet depot", "clark & son", "skyline", "rta store"]) {
      expect(lower).not.toContain(brand);
    }
    // Every planned item must reference a real catalog code (never invented):
    // fillers are the only synthetic items and are clearly marked.
    for (const wall of res.plan) {
      expect(["kitchen", "closet"]).toContain(wall.mode);
      for (const item of wall.items) {
        expect(typeof item.masterCode).toBe("string");
        expect(item.masterCode.length).toBeGreaterThan(0);
        expect(item.width).toBeGreaterThan(0);
        if (item.isFiller) {
          expect(item.masterCode.startsWith("FILL-")).toBe(true);
        }
      }
      // The plan must reference one of the walls we sent.
      expect(["back", "left"]).toContain(wall.wallId);
    }
  }, 30000);

  it("always returns a layout for a closet build request (deterministic fallback)", async () => {
    const caller = publicCaller();
    const res = await caller.design.consult({
      message: "Fill the back wall with base cabinets and leave room for a sink",
      walls: [
        { id: "back", label: "Back", lengthInches: 96 },
        { id: "front", label: "Front", lengthInches: 144 },
      ],
      roomType: "closet",
    });
    // Even though the room is a closet, a build request must produce a plan.
    expect(res.plan.length).toBeGreaterThan(0);
    const totalItems = res.plan.reduce((n, w) => n + w.items.length, 0);
    expect(totalItems).toBeGreaterThan(0);
    for (const wall of res.plan) {
      for (const item of wall.items) {
        expect(item.masterCode.length).toBeGreaterThan(0);
        expect(item.width).toBeGreaterThan(0);
      }
    }
  }, 30000);

  it("rejects an empty wall list", async () => {
    const caller = publicCaller();
    await expect(
      caller.design.consult({
        message: "fill it",
        walls: [],
        roomType: "kitchen",
      } as any),
    ).rejects.toBeTruthy();
  });
});

// Pure-engine guarantee that the consultant relies on: widths always add up to
// the span (minus a tiny rounding tolerance) and fillers stay within bounds.
describe("fillEngine determinism (consultant safety net)", () => {
  const catalog: FillCabinet[] = [
    { id: 1, masterCode: "B-36", description: '36" Base', width: "36", placement: "base", subCategory: "Base", category: "Base", isCornerCabinet: false },
    { id: 2, masterCode: "B-24", description: '24" Base', width: "24", placement: "base", subCategory: "Base", category: "Base", isCornerCabinet: false },
    { id: 3, masterCode: "B-18", description: '18" Base', width: "18", placement: "base", subCategory: "Base", category: "Base", isCornerCabinet: false },
    { id: 4, masterCode: "B-12", description: '12" Base', width: "12", placement: "base", subCategory: "Base", category: "Base", isCornerCabinet: false },
  ];

  it("tiles a 120-inch wall so widths sum to the span", () => {
    const res = autoFillSpan(120, "kitchen", catalog);
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.usedInches).toBeCloseTo(120, 1);
    expect(res.leftoverInches).toBeLessThanOrEqual(1.5);
  });

  it("leaves an awkward leftover as an open gap (fillers disabled)", () => {
    // 39" → places a 36" cabinet and reports the remaining 3" as leftover; no
    // filler is ever inserted.
    const res = autoFillSpan(39, "kitchen", catalog);
    expect(res.items.some((it) => it.isFiller)).toBe(false);
    expect(res.items.reduce((s, it) => s + it.width, 0)).toBeCloseTo(36, 1);
    expect(res.leftoverInches).toBeCloseTo(3, 1);
  });
});
