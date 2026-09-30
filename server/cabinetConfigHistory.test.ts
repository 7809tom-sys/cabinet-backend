import { afterAll, describe, expect, it } from "vitest";
import { eq, and, like } from "drizzle-orm";
import { getDb } from "./db";
import { cabinetConfigChangeLog } from "../drizzle/schema";
import { logCabinetConfigChanges, recentCabinetConfigChanges, parseLoggedValue } from "./lib/cabinetConfigHistory";

const TEST_CODE = "ZZTEST-HISTORY";

describe("cabinet config change log", () => {
  afterAll(async () => {
    const db = await getDb();
    if (db) await db.delete(cabinetConfigChangeLog).where(like(cabinetConfigChangeLog.masterCode, `${TEST_CODE}%`));
  });

  it("logs only fields that actually changed, with old and new values", async () => {
    const db = await getDb();
    if (!db) return;
    const n = await logCabinetConfigChanges(db, {
      cabinetId: 1,
      masterCode: TEST_CODE,
      scope: "master",
      before: { width: "12.00", hingeSide: "L", specNotes: null, keepMe: "same" },
      after: { width: 15, hingeSide: "L", specNotes: "new note", keepMe: "same" },
      actor: { id: 1, name: "Test Admin" },
    });
    expect(n).toBe(2);
    const rows = await recentCabinetConfigChanges(db, { cabinetId: 1 });
    const mine = rows.filter((r) => r.masterCode === TEST_CODE);
    const fields = mine.map((r) => r.field).sort();
    expect(fields).toEqual(["specNotes", "width"]);
    const width = mine.find((r) => r.field === "width")!;
    expect(width.oldValue).toBe("12.00");
    expect(width.newValue).toBe(15);
    expect(width.changedByName).toBe("Test Admin");
    expect(width.scope).toBe("master");
    expect(width.canRevert).toBe(true);
  });

  it("logs distributor-scoped changes with the distributor id and nothing when unchanged", async () => {
    const db = await getDb();
    if (!db) return;
    const zero = await logCabinetConfigChanges(db, {
      cabinetId: 2, masterCode: TEST_CODE + "-D", scope: "distributor", distributorId: 210001,
      before: { width: 12 }, after: { width: "12" }, actor: { id: 1, name: "x" },
    });
    expect(zero).toBe(0);
    const one = await logCabinetConfigChanges(db, {
      cabinetId: 2, masterCode: TEST_CODE + "-D", scope: "distributor", distributorId: 210001,
      before: {}, after: { depth: 24 }, actor: { id: 1, name: "x" },
    });
    expect(one).toBe(1);
    const rows = await recentCabinetConfigChanges(db, { cabinetId: 2 });
    const r = rows.find((x) => x.masterCode === TEST_CODE + "-D")!;
    expect(r.distributorId).toBe(210001);
    expect(r.oldValue).toBeNull();
    expect(r.newValue).toBe(24);
  });

  it("parses logged values safely", () => {
    expect(parseLoggedValue(null)).toBeNull();
    expect(parseLoggedValue("12")).toBe(12);
    expect(parseLoggedValue("not json")).toBe("not json");
  });
});
