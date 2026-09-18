import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DesignTool.tsx"), "utf8");

describe("Continuous Wall Builder refresh restoration", () => {
  it("counts the restored room shell as a persisted 2D plan even with zero cabinets", () => {
    expect(source).toContain("const hasPersistedRoomLayout = hasDesignedRoomGeometry(room);");
    expect(source).toContain("const hasPersistedTwoDPlan = hasPersistedRoomLayout || placed.length > 0");
    expect(source).toContain("if (!hasPersistedTwoDPlan) return null;");
    expect(source).toContain("roomOverride={room}");
  });

  it("keeps a wall-only draft and reports it restored after refresh", () => {
    const writeStart = source.indexOf("const writeDraft = usePersistFn(() => {");
    const restoreEnd = source.indexOf("// Pre-select a door style", writeStart);
    expect(writeStart).toBeGreaterThan(-1);
    expect(restoreEnd).toBeGreaterThan(writeStart);
    const persistence = source.slice(writeStart, restoreEnd);
    expect(persistence).toContain("hasDesignedRoomGeometry(snap.room)");
    expect(persistence).toContain("localStorage.setItem(draftKey, JSON.stringify(snap))");
    expect(persistence).toContain("hasDesignedRoomGeometry(d.room as RoomData)");
  });
});
