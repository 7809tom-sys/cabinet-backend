import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { getDb } from "./db";
import { cabinetConfigChangeLog, cabinetRecoverySnapshots, cabinets } from "../drizzle/schema";
import {
  diffSnapshotAgainstRow,
  restoreCabinetFromSnapshot,
  scanRecoverableCabinets,
  snapshotCabinet,
  snapshotsForCabinet,
} from "./lib/cabinetRecovery";

const TEST_CODE = "ZZTEST-RECOVERY";
const actor = { id: 1, name: "Recovery Test" };

describe("cabinet data recovery", () => {
  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(cabinetRecoverySnapshots).where(like(cabinetRecoverySnapshots.masterCode, `${TEST_CODE}%`));
    await db.delete(cabinetConfigChangeLog).where(like(cabinetConfigChangeLog.masterCode, `${TEST_CODE}%`));
    await db.delete(cabinets).where(like(cabinets.masterCode, `${TEST_CODE}%`));
  });

  it("diffs only real, non-protected differences", () => {
    const diff = diffSnapshotAgainstRow(
      { id: 1, masterCode: "X", width: "12.00", description: "old", configuredAt: "2026-01-01", specNotes: null },
      { id: 1, masterCode: "X", width: 12, description: "new", configuredAt: new Date(), specNotes: "" },
    );
    expect(diff.map((d) => d.field)).toEqual(["description"]);
  });

  it("snapshots a cabinet, restores a field from it, and records the restore", async () => {
    const db = await getDb();
    if (!db) return;
    const [ins] = await db.insert(cabinets).values({
      masterCode: TEST_CODE,
      description: "Original description",
      category: "Base",
      width: "24.00",
      height: "34.50",
      depth: "24.00",
      isActive: false,
      showInCatalog: false,
      showInDesigner: false,
    } as typeof cabinets.$inferInsert);
    const cabinetId = Number((ins as { insertId: number }).insertId);
    expect(cabinetId).toBeGreaterThan(0);

    const snapId = await snapshotCabinet(db, { cabinetId, reason: "manual", actor });
    expect(snapId).toBeTruthy();

    // Simulate a lost edit: someone overwrote the description and width.
    await db.update(cabinets).set({ description: "Overwritten", width: "30.00" }).where(eq(cabinets.id, cabinetId));

    const snaps = await snapshotsForCabinet(db, cabinetId);
    expect(snaps.length).toBe(1);
    const [live] = await db.select().from(cabinets).where(eq(cabinets.id, cabinetId)).limit(1);
    const diff = diffSnapshotAgainstRow(snaps[0].row!, live as unknown as Record<string, unknown>);
    expect(diff.map((d) => d.field).sort()).toEqual(["description", "width"]);

    // Restore only the description.
    const r = await restoreCabinetFromSnapshot(db, { snapshotId: snapId!, fields: ["description"], actor });
    expect(r.restoredFields).toBe(1);
    const [after] = await db.select().from(cabinets).where(eq(cabinets.id, cabinetId)).limit(1);
    expect(after.description).toBe("Original description");
    expect(Number(after.width)).toBe(30); // untouched

    // A before-restore snapshot was taken and the restore is in the change log.
    const snaps2 = await snapshotsForCabinet(db, cabinetId);
    expect(snaps2.map((s) => s.reason).sort()).toEqual(["before-restore", "manual"]);
    const logRows = await db.select().from(cabinetConfigChangeLog).where(eq(cabinetConfigChangeLog.cabinetId, cabinetId));
    expect(logRows.some((l) => l.field === "description" && l.scope === "master")).toBe(true);

    // The recovery scan lists this cabinet with its traces.
    const scan = await scanRecoverableCabinets(db, { days: 1, cabinetId });
    const me = scan.cabinets.find((c) => c.cabinetId === cabinetId);
    expect(me).toBeTruthy();
    expect(me!.snapshots).toBe(2);
    expect(me!.loggedChanges).toBeGreaterThanOrEqual(1);
    expect(me!.detailsLost).toBe(false);
  });
});
