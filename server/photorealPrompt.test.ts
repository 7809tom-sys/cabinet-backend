import { describe, it, expect } from "vitest";
import { buildPhotorealPrompt } from "@shared/photorealPrompt";

const base = { roomWidthFt: 12, roomDepthFt: 10, ceilingFt: 8 };

describe("buildPhotorealPrompt", () => {
  it("always includes the photographic quality bar and negative constraints", () => {
    const p = buildPhotorealPrompt(base);
    expect(p).toContain("photorealistic interior photograph");
    expect(p).toContain("Do NOT include:");
    // negative prompt must forbid the CAD / floor-plan look we are moving away from
    expect(p.toLowerCase()).toContain("floor-plan");
    expect(p.toLowerCase()).toContain("watermark");
    expect(p.toLowerCase()).toContain("text");
  });

  it("states room dimensions in clean feet", () => {
    const p = buildPhotorealPrompt({ roomWidthFt: 12, roomDepthFt: 10.5, ceilingFt: 9 });
    expect(p).toContain("12 feet wide");
    expect(p).toContain("10.5 feet deep");
    expect(p).toContain("9-foot ceiling");
  });

  it("defaults ceiling to 8ft when omitted", () => {
    const p = buildPhotorealPrompt({ roomWidthFt: 10, roomDepthFt: 10 });
    expect(p).toContain("8-foot ceiling");
  });

  it("defaults to a three-quarter angle and daylight", () => {
    const p = buildPhotorealPrompt(base);
    expect(p).toContain("three-quarter angle");
    expect(p.toLowerCase()).toContain("natural daylight");
  });

  it("uses the requested camera angle", () => {
    expect(buildPhotorealPrompt({ ...base, cameraAngle: "straight-on" })).toContain("straight-on");
    expect(buildPhotorealPrompt({ ...base, cameraAngle: "wide" })).toContain("Wide establishing shot");
  });

  it("uses the requested lighting mood", () => {
    expect(buildPhotorealPrompt({ ...base, timeOfDay: "golden-hour" }).toLowerCase()).toContain("golden-hour");
    expect(buildPhotorealPrompt({ ...base, timeOfDay: "evening" }).toLowerCase()).toContain("under-cabinet led");
  });

  it("describes finish and door style when provided", () => {
    const p = buildPhotorealPrompt({ ...base, finishName: "Aspen White", doorStyle: "Shaker" });
    expect(p).toContain("Aspen White Shaker-style kitchen cabinets");
  });

  it("adds a two-tone clause with the second finish", () => {
    const p = buildPhotorealPrompt({ ...base, finishName: "Aspen White", secondFinishName: "Navy" });
    expect(p).toContain("two-tone");
    expect(p).toContain("Navy");
  });

  it("includes countertop and hardware when provided", () => {
    const p = buildPhotorealPrompt({ ...base, countertop: "White Quartz", hardware: "brushed nickel bar pulls" });
    expect(p).toContain("White Quartz");
    expect(p).toContain("brushed nickel bar pulls");
  });

  it("includes the per-wall layout summaries", () => {
    const p = buildPhotorealPrompt({
      ...base,
      wallSummaries: ["Back wall: 8ft run of base cabinets with a sink", "Left wall: tall pantry column"],
    });
    expect(p).toContain("EXACT cabinet-by-cabinet layout");
    expect(p).toContain("Back wall: 8ft run of base cabinets with a sink");
    expect(p).toContain("Left wall: tall pantry column");
  });

  it("states a one-wall layout firmly and forbids an island", () => {
    const p = buildPhotorealPrompt({
      ...base,
      layoutType: "one-wall",
      cabinetWalls: ["Back wall"],
      hasIsland: false,
    });
    expect(p).toContain("SINGLE-WALL");
    expect(p).toContain("NO island");
    expect(p).toContain("ONLY on the following wall(s): Back wall");
    expect(p).toContain("There is NO kitchen island");
    // The three-quarter camera clause must NOT force two adjoining runs.
    expect(p).not.toContain("two adjoining runs of cabinetry");
  });

  it("describes galley, L-shaped and U-shaped layouts", () => {
    expect(buildPhotorealPrompt({ ...base, layoutType: "galley" })).toContain("GALLEY");
    expect(buildPhotorealPrompt({ ...base, layoutType: "L-shaped" })).toContain("L-SHAPED");
    expect(buildPhotorealPrompt({ ...base, layoutType: "U-shaped" })).toContain("U-SHAPED");
  });

  it("lists only the appliances actually placed and forbids extras", () => {
    const p = buildPhotorealPrompt({
      ...base,
      appliances: ["a range", "a refrigerator", "a sink"],
    });
    expect(p).toContain("a range, a refrigerator, a sink");
    expect(p).toContain("Do not add any other appliances");
    // global negative constraint against inventing geometry
    expect(p).toContain("Do NOT invent, add, or rearrange any cabinets");
  });

  it("mentions an island only when hasIsland is set", () => {
    expect(buildPhotorealPrompt({ ...base, hasIsland: true })).toContain("central kitchen island");
    expect(buildPhotorealPrompt({ ...base, hasIsland: false })).not.toContain("central kitchen island");
  });

  it("describes surfaces & fixtures from the wizard when provided", () => {
    const p = buildPhotorealPrompt({
      ...base,
      flooring: "light natural-oak luxury vinyl plank",
      backsplash: "white marble hexagon mosaic",
      sink: "undermount stainless farmhouse sink",
      faucet: "matte black pull-down faucet",
    });
    expect(p).toContain("light natural-oak luxury vinyl plank");
    expect(p).toContain("white marble hexagon mosaic");
    expect(p).toContain("undermount stainless farmhouse sink");
    expect(p).toContain("matte black pull-down faucet");
  });

  it("omits surface clauses when not provided", () => {
    const p = buildPhotorealPrompt(base);
    expect(p).not.toContain("The floor is");
    expect(p).not.toContain("The backsplash is");
  });

  it("appends free-form notes", () => {
    const p = buildPhotorealPrompt({ ...base, notes: "open floating shelves on the right wall" });
    expect(p).toContain("open floating shelves on the right wall");
  });
});
