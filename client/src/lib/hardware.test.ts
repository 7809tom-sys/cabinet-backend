import { describe, it, expect } from "vitest";
import {
  HARDWARE_STYLES,
  DEFAULT_HARDWARE_STYLE_ID,
  hardwareStyle,
  doorCountForCabinet,
  drawerCountForCabinet,
  displayDrawerCount,
  hardwareForCabinet,
  hardwareSchedule,
  hardwareScheduleNote,
  doorConstruction,
  hardwarePlacementSpec,
  hardwarePlacementNote,
} from "./hardware";
import type { PlacedCabinet } from "./design";

function cab(partial: Partial<PlacedCabinet>): PlacedCabinet {
  return {
    uid: "u",
    cabinetId: 1,
    masterCode: "B-24",
    description: "Base 24",
    placement: "base",
    x: 0,
    y: 0,
    width: 24,
    depth: 24,
    rotation: 0,
    ...partial,
  };
}

describe("hardware styles", () => {
  it("exposes the expected style ids including a default of none", () => {
    const ids = HARDWARE_STYLES.map((s) => s.id);
    expect(ids).toEqual(["none", "knob", "bar-pull", "cup-pull", "knob-and-pull"]);
    expect(DEFAULT_HARDWARE_STYLE_ID).toBe("none");
  });

  it("falls back to the default style for unknown/empty ids", () => {
    expect(hardwareStyle(undefined).id).toBe("none");
    expect(hardwareStyle(null).id).toBe("none");
    // @ts-expect-error testing an invalid id at runtime
    expect(hardwareStyle("bogus").id).toBe("none");
  });
});

describe("door / drawer counting", () => {
  it("counts a stored door count when present", () => {
    expect(doorCountForCabinet(cab({ numberOfDoors: 2 }))).toBe(2);
  });

  it("treats a drawer base (no door) as zero doors", () => {
    expect(doorCountForCabinet(cab({ masterCode: "DB-24-3", description: "Drawer Base 24 (3 drawer)" }))).toBe(0);
  });

  it("reads drawer count from a -N drawer-base code", () => {
    expect(drawerCountForCabinet(cab({ masterCode: "DB-24-3", description: "Drawer Base" }))).toBe(3);
    expect(drawerCountForCabinet(cab({ masterCode: "DB-15-2", description: "Drawer Base" }))).toBe(2);
  });

  it("trusts a stored drawer count over the code", () => {
    expect(drawerCountForCabinet(cab({ masterCode: "DB-24-3", numberOfDrawers: 4 }))).toBe(4);
  });

  it("a plain door base has no drawers in the simplified model", () => {
    expect(drawerCountForCabinet(cab({ masterCode: "B-24", description: "Base 24" }))).toBe(0);
  });

  it("appliances, panels, and unpriced items carry no hardware", () => {
    expect(doorCountForCabinet(cab({ placement: "appliance", cabinetId: 0, masterCode: "RANGE-30" }))).toBe(0);
    expect(doorCountForCabinet(cab({ masterCode: "WSV-30", description: "Wall Skin Panel" }))).toBe(0);
    expect(drawerCountForCabinet(cab({ placement: "appliance", cabinetId: 0 }))).toBe(0);
  });
});

describe("display drawer count (elevation drawer fronts)", () => {
  it("draws the full drawer stack for a drawer base", () => {
    expect(displayDrawerCount(cab({ masterCode: "DB-24-3", description: "Drawer Base" }))).toBe(3);
  });

  it("gives a standard base cabinet a single top drawer front", () => {
    expect(displayDrawerCount(cab({ masterCode: "B-24", description: "Base 24", numberOfDoors: 1 }))).toBe(1);
  });

  it("does not add a top drawer to wall cabinets", () => {
    expect(displayDrawerCount(cab({ placement: "wall", masterCode: "W-2430", description: "Wall 24x30", numberOfDoors: 2 }))).toBe(0);
  });

  it("skips corner / lazy susan / trash bases", () => {
    expect(displayDrawerCount(cab({ masterCode: "LS-36", description: "Lazy Susan corner" }))).toBe(0);
    expect(displayDrawerCount(cab({ masterCode: "BWB-18", description: "Base Waste Basket trash pull-out" }))).toBe(0);
  });
});

describe("hardware per cabinet", () => {
  it("style 'none' yields zero pieces", () => {
    expect(hardwareForCabinet(cab({ numberOfDoors: 2 }), "none").total).toBe(0);
  });

  it("knob style puts a knob on each door and drawer", () => {
    const c = hardwareForCabinet(cab({ masterCode: "DB-24-3", numberOfDoors: 0, numberOfDrawers: 3 }), "knob");
    expect(c.knobs).toBe(3);
    expect(c.barPulls).toBe(0);
    expect(c.total).toBe(3);
  });

  it("bar-pull style puts a bar pull on each door and drawer", () => {
    const c = hardwareForCabinet(cab({ numberOfDoors: 2, numberOfDrawers: 0 }), "bar-pull");
    expect(c.barPulls).toBe(2);
    expect(c.knobs).toBe(0);
  });

  it("cup-pull style mixes cup pulls on drawers + knobs on doors", () => {
    const c = hardwareForCabinet(cab({ masterCode: "B-30-2D", numberOfDoors: 1, numberOfDrawers: 2 }), "cup-pull");
    expect(c.knobs).toBe(1);
    expect(c.cupPulls).toBe(2);
    expect(c.barPulls).toBe(0);
    expect(c.total).toBe(3);
  });

  it("knob-and-pull style: knobs on doors, bar pulls on drawers", () => {
    const c = hardwareForCabinet(cab({ numberOfDoors: 2, numberOfDrawers: 1 }), "knob-and-pull");
    expect(c.knobs).toBe(2);
    expect(c.barPulls).toBe(1);
  });
});

describe("hardware schedule aggregation", () => {
  const layout: PlacedCabinet[] = [
    cab({ uid: "a", masterCode: "B-24", numberOfDoors: 1, numberOfDrawers: 0 }),
    cab({ uid: "b", masterCode: "DB-24-3", numberOfDoors: 0, numberOfDrawers: 3 }),
    cab({ uid: "c", placement: "appliance", cabinetId: 0, masterCode: "RANGE-30" }),
    cab({ uid: "d", masterCode: "WSV-30", description: "Wall Skin Panel" }),
  ];

  it("returns a zeroed schedule for style none", () => {
    const s = hardwareSchedule(layout, "none");
    expect(s.total).toBe(0);
    expect(s.cabinetsWithHardware).toBe(0);
    expect(hardwareScheduleNote(s)).toBeNull();
  });

  it("totals knobs across doors + drawers, skipping appliances and panels", () => {
    const s = hardwareSchedule(layout, "knob");
    // 1 door knob (B-24) + 3 drawer knobs (DB-24-3) = 4; range + panel skipped
    expect(s.knobs).toBe(4);
    expect(s.total).toBe(4);
    expect(s.cabinetsWithHardware).toBe(2);
  });

  it("cup-pull schedule splits cup pulls (drawers) and knobs (doors)", () => {
    const s = hardwareSchedule(layout, "cup-pull");
    expect(s.knobs).toBe(1); // B-24 door
    expect(s.cupPulls).toBe(3); // DB-24-3 drawers
    expect(s.total).toBe(4);
  });

  it("builds a human-readable build-sheet note", () => {
    const note = hardwareScheduleNote(hardwareSchedule(layout, "cup-pull"));
    expect(note).toContain("Cup Pulls");
    expect(note).toContain("1 knob");
    expect(note).toContain("3 cup pulls");
    expect(note).toContain("4 pieces total");
  });
});

describe("hardware placement spec", () => {
  it("classifies framed vs slab door styles", () => {
    expect(doorConstruction("Shaker")).toBe("framed");
    expect(doorConstruction("Slim Shaker")).toBe("framed");
    expect(doorConstruction("Raised Panel")).toBe("framed");
    expect(doorConstruction(null)).toBe("framed"); // default
    expect(doorConstruction("Slab")).toBe("slab");
    expect(doorConstruction("Flat Panel")).toBe("slab");
    expect(doorConstruction("Euro")).toBe("slab");
  });

  it("framed spec centers on the stile and offsets from the rail", () => {
    const spec = hardwarePlacementSpec("Shaker");
    expect(spec.construction).toBe("framed");
    expect(spec.doorRule).toMatch(/stile/i);
    expect(spec.doorRule).toMatch(/2\.5–3"/);
    expect(spec.doorRule).toMatch(/bottom rail/i);
    expect(spec.doorRule).toMatch(/top rail/i);
    expect(spec.drawerRule).toMatch(/centered/i);
  });

  it("slab spec insets from the edges", () => {
    const spec = hardwarePlacementSpec("Slab");
    expect(spec.construction).toBe("slab");
    expect(spec.doorRule).toMatch(/inset/i);
    expect(spec.doorRule).toMatch(/edge/i);
  });

  it("placement note is null when no hardware, present otherwise", () => {
    expect(hardwarePlacementNote("none", "Shaker")).toBeNull();
    const note = hardwarePlacementNote("knob", "Shaker");
    expect(note).toMatch(/Hardware placement/);
    expect(note).toMatch(/stile/i);
  });
});
