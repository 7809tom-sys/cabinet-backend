import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DOOR_EDGE_PROFILES, DOOR_PANEL_CONSTRUCTIONS, DOOR_DRAWER_FRONTS, doorEdgeProfileLayers, doorEdgeProfileStrips,
  doorProfileSpecRows, normalizeInsideEdgeProfile,
} from "../shared/doorProfiles";
import { buildDoorProfilePatch, canEditDoorStyle } from "../shared/doorProfileRules";
import { doorProfileValuesFromStyle, doorProfileValuesToPayload } from "../client/src/lib/doorProfileForm";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");

describe("door profile options (own list, countertop edges untouched)", () => {
  it("offers the six requested edges, with a drawing and label each", () => {
    expect(DOOR_EDGE_PROFILES.map((p) => p.id)).toEqual(["square", "bevel", "ogee", "cove", "bead", "step"]);
    for (const o of [...DOOR_EDGE_PROFILES, ...DOOR_PANEL_CONSTRUCTIONS, ...DOOR_DRAWER_FRONTS]) {
      expect(o.svgPath.length).toBeGreaterThan(10);
      expect(o.label.length).toBeGreaterThan(2);
    }
    expect(DOOR_PANEL_CONSTRUCTIONS.map((p) => p.id)).toEqual(["raised", "flat", "slab", "glass"]);
    expect(read("client/src/lib/design.ts")).toContain('{ id: "eased",       name: "Eased"');
  });
  it("maps legacy free text to the nearest id, or unset", () => {
    expect(normalizeInsideEdgeProfile("beveled ogee")).toBe("ogee");
    expect(normalizeInsideEdgeProfile("Beaded inner edge")).toBe("bead");
    expect(normalizeInsideEdgeProfile("Bevel")).toBe("bevel");
    expect(normalizeInsideEdgeProfile("90 degree")).toBe("square");
    expect(normalizeInsideEdgeProfile("cove")).toBe("cove");
    expect(normalizeInsideEdgeProfile("step detail")).toBe("step");
    expect(normalizeInsideEdgeProfile("something odd")).toBeNull();
    expect(normalizeInsideEdgeProfile("")).toBeNull();
    expect(normalizeInsideEdgeProfile(null)).toBeNull();
    expect(doorProfileValuesFromStyle({ insideEdgeProfile: "beveled ogee" }).insideEdgeProfile).toBe("ogee");
    expect(doorProfileValuesFromStyle({ insideEdgeProfile: "mystery" }).insideEdgeProfile).toBe("");
  });
  it("never invents a value: unset stays unset in the form and payload", () => {
    const v = doorProfileValuesFromStyle({});
    expect(v.panelConstruction).toBe("");
    expect(v.finishSheen).toBe("");
    const p = doorProfileValuesToPayload(v);
    expect(p.panelConstruction).toBeNull();
    expect(p.drawerFrontType).toBeNull();
    expect(p.insideEdgeProfile).toBeNull();
    expect(p.railWidth).toBeNull();
  });
  it("saves the fixed id, not free text", () => {
    expect(buildDoorProfilePatch({ insideEdgeProfile: "beveled ogee" }).insideEdgeProfile).toBe("ogee");
    expect(buildDoorProfilePatch({ insideEdgeProfile: "weird" }).insideEdgeProfile).toBeNull();
    expect(read("server/lib/doorProfileAccess.ts")).toContain("z.enum(DOOR_PANEL_CONSTRUCTION_IDS)");
  });
});

describe("3D Designer renders the chosen edge", () => {
  it("square has no edge strips; bevel adds layered strips on all four sides", () => {
    expect(doorEdgeProfileLayers("square")).toEqual([]);
    expect(doorEdgeProfileStrips("square", 0.4, 0.6, 1 / 12)).toEqual([]);
    expect(doorEdgeProfileStrips(null, 0.4, 0.6, 1 / 12)).toEqual([]);
    const bevel = doorEdgeProfileStrips("bevel", 0.4, 0.6, 1 / 12);
    expect(bevel.length).toBe(doorEdgeProfileLayers("bevel").length * 4);
    expect(new Set(bevel.map((s) => s.side))).toEqual(new Set(["top", "bottom", "left", "right"]));
    for (const s of bevel) { expect(s.width).toBeGreaterThan(0); expect(s.height).toBeGreaterThan(0); expect(s.z).toBeGreaterThan(0.013); }
  });
  it("each non-square edge renders differently", () => {
    const sig = (id: string) => JSON.stringify(doorEdgeProfileLayers(id));
    const ids = ["bevel", "ogee", "cove", "bead", "step"];
    expect(new Set(ids.map(sig)).size).toBe(ids.length);
  });
  it("InteractiveRoom3D uses the shared strips and normalised id (falls back to square)", () => {
    const src = read("client/src/components/design/InteractiveRoom3D.tsx");
    expect(src).toContain("doorEdgeProfileStrips(doorProfile?.insideEdgeProfile");
    expect(src).toContain('normalizeInsideEdgeProfile(doorProfile?.insideEdgeProfile) ?? "square"');
  });
});

describe("one shared editor, server-enforced ownership", () => {
  it("admin Featured Door Styles and Vendor Portal both use the shared editor and shared payload", () => {
    const admin = read("client/src/components/admin/FeaturedStylesAdmin.tsx");
    const vendor = read("client/src/pages/VendorPortal.tsx");
    for (const src of [admin, vendor]) {
      expect(src).toContain("<DoorProfileEditor");
      expect(src).toContain("doorProfileValuesToPayload(profile)");
    }
    expect(admin).not.toContain('id="ed-edge-profile"');
    expect(vendor).not.toContain("Verified frame profile");
    expect(vendor).toContain('testId="measuring-sheet-edge-picker"');
  });
  it("editor has an inline picture picker for edge, panel and drawer front", () => {
    const ed = read("client/src/components/door/DoorProfileEditor.tsx");
    for (const id of ["door-profile-edge-picker", "door-profile-panel-picker", "door-profile-drawer-picker"]) expect(ed).toContain(id);
    expect(read("client/src/components/door/DoorProfilePicker.tsx")).toContain('role="radio"');
  });
  const admin = { isAdmin: true, distributorIds: [] as number[] };
  const vendor = { isAdmin: false, distributorIds: [7] };
  it("admin can edit any style", () => {
    expect(canEditDoorStyle(admin, { distributorId: 99 })).toBe("ok");
    expect(canEditDoorStyle(admin, { distributorId: null })).toBe("ok");
  });
  it("a distributor can edit its own styles", () => {
    expect(canEditDoorStyle(vendor, { distributorId: 7 })).toBe("ok");
  });
  it("a distributor is blocked from another distributor's style, or an unowned one", () => {
    expect(canEditDoorStyle(vendor, { distributorId: 8 })).toBe("forbidden");
    expect(canEditDoorStyle(vendor, { distributorId: null })).toBe("forbidden");
    expect(canEditDoorStyle(vendor, undefined)).toBe("not_found");
    const guard = read("server/lib/doorProfileAccess.ts");
    expect(guard).toContain('code: "FORBIDDEN"');
    expect(guard).toContain("asserts style is T");
  });
  it("vendor route checks ownership on the style row, then writes through the shared builder", () => {
    const src = read("server/routers/distributorPortal.ts");
    const mutation = src.slice(src.indexOf("updateFeaturedStyleMaterials: withVendorFeature"));
    expect(mutation).toContain("...doorProfileFieldsShape");
    expect(mutation.indexOf("assertCanEditDoorStyle(")).toBeGreaterThan(0);
    expect(mutation.indexOf("assertCanEditDoorStyle(")).toBeLessThan(mutation.indexOf("Object.assign(patch, buildDoorProfilePatch(fields))"));
    expect(read("server/routers/catalog.ts")).toContain("Object.assign(patch, buildDoorProfilePatch(fields))");
  });
});

describe("public Door Profile Spec shows only what is specified", () => {
  it("lists picture-backed specs and omits blanks (nothing invented)", () => {
    expect(doorProfileSpecRows({})).toEqual([]);
    expect(doorProfileSpecRows({ railWidth: null, stileWidth: "", insideEdgeProfile: "mystery", panelConstruction: null })).toEqual([]);
    const rows = doorProfileSpecRows({ insideEdgeProfile: "bevel", panelConstruction: "flat", railWidth: "2.5", stileWidth: "2.5", finishSheen: "satin" });
    expect(rows.map((r) => r.label)).toEqual(["Inside edge", "Panel", "Rail", "Stile", "Sheen"]);
    expect(rows.find((r) => r.label === "Rail")!.value).toBe('2.5"');
  });
  it("Door Styles page renders it from the style record", () => {
    const page = read("client/src/pages/DoorStyles.tsx");
    expect(page).toContain("doorProfileSpecRows(style)");
    expect(page).toContain('data-testid="door-profile-spec"');
  });
});
