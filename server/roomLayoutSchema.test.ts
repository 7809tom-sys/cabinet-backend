import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  designLayoutInstances,
  designLayoutZoneSelections,
  kitchenDesigns,
  layoutPresetZones,
  layoutPresets,
  roomShapePresets,
} from "../drizzle/schema";

describe("room-layout catalog schema", () => {
  it("defines the room-shape, layout, zone, and saved-resolution tables", () => {
    expect(getTableName(roomShapePresets)).toBe("room_shape_presets");
    expect(getTableName(layoutPresets)).toBe("layout_presets");
    expect(getTableName(layoutPresetZones)).toBe("layout_preset_zones");
    expect(getTableName(designLayoutInstances)).toBe("design_layout_instances");
    expect(getTableName(designLayoutZoneSelections)).toBe("design_layout_zone_selections");
  });

  it("keeps saved designs and zone selections tied to the canonical catalog identifiers", () => {
    expect(kitchenDesigns.designSchemaVersion.name).toBe("designSchemaVersion");
    expect(kitchenDesigns.layoutPresetId.name).toBe("layoutPresetId");
    expect(designLayoutZoneSelections.cabinetId.name).toBe("cabinetId");
    expect(designLayoutZoneSelections.distributorSkuId.name).toBe("distributorSkuId");
    expect(designLayoutZoneSelections.styleId.name).toBe("styleId");
  });
});
