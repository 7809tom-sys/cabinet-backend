import { afterAll, describe, expect, it } from "vitest";
import { eq, and, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { cabinets, cabinetMasterChangeRequests, distributorSkus, distributorCabinetOverrides } from "../drizzle/schema";
import {
  applyDistributorCabinetConfig,
  parseDistributorCabinetConfig,
  DISTRIBUTOR_CONFIG_KEYS,
} from "./lib/distributorCabinetConfig";

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 999702,
      openId: "test-admin-masterchanges",
      name: "Master Changes Test Admin",
      email: "admin-masterchanges-test@example.com",
      role: "admin",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}
function userCtx(): TrpcContext {
  return {
    user: { id: 1, openId: "o1", name: "T", email: "t@x.com", role: "user" } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("per-distributor cabinet config rule (shared helper)", () => {
  it("keeps the master value for every key the rule omits, replaces only present keys", () => {
    const master = { id: 1, masterCode: "B12", width: "12", depth: "24", numberOfDoors: 1, description: "Base 12" };
    const merged = applyDistributorCabinetConfig(master, { depth: "21", numberOfDoors: 2 });
    expect(merged).toEqual({ ...master, depth: "21", numberOfDoors: 2 });
    expect(merged.width).toBe("12");
    expect(merged.masterCode).toBe("B12");
  });
  it("returns the same object when nothing applies (no accidental rewrites)", () => {
    const master = { id: 1, width: "12" };
    expect(applyDistributorCabinetConfig(master, {})).toBe(master);
    expect(applyDistributorCabinetConfig(master, null)).toBe(master);
    expect(applyDistributorCabinetConfig(master, { width: "12" })).toBe(master);
  });
  it("never carries price or SKU fields (schema excludes them)", () => {
    for (const forbidden of ["listPrice", "price", "cost", "sku", "vendorSku", "altSku1", "masterCode", "isActive"]) {
      expect(DISTRIBUTOR_CONFIG_KEYS).not.toContain(forbidden);
    }
    // unknown keys are stripped at parse time
    const parsed = parseDistributorCabinetConfig(JSON.stringify({ depth: "21", listPrice: "999" }));
    expect(parsed).toEqual({ depth: "21" });
  });
  it("treats invalid JSON / invalid values as an empty rule", () => {
    expect(parseDistributorCabinetConfig("not json")).toEqual({});
    expect(parseDistributorCabinetConfig(null)).toEqual({});
    expect(parseDistributorCabinetConfig(JSON.stringify({ numberOfDoors: 99 }))).toEqual({});
  });
});

describe("masterChanges router (live DB, self-cleaning, never approves)", () => {
  const createdIds: number[] = [];
  let touchedOverride: { distributorId: number; cabinetId: number; hadRowBefore: boolean } | null = null;

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (createdIds.length) {
      await db.delete(cabinetMasterChangeRequests).where(inArray(cabinetMasterChangeRequests.id, createdIds));
    }
    if (touchedOverride && !touchedOverride.hadRowBefore) {
      await db
        .delete(distributorCabinetOverrides)
        .where(and(
          eq(distributorCabinetOverrides.cabinetId, touchedOverride.cabinetId),
          eq(distributorCabinetOverrides.distributorId, touchedOverride.distributorId),
        ));
    }
  });

  async function pickCabinet() {
    const db = await getDb();
    if (!db) return null;
    // A cabinet carried by at least one distributor
    const [row] = await db
      .select({ id: cabinets.id, masterCode: cabinets.masterCode, depth: cabinets.depth, distributorId: distributorSkus.distributorId })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .where(eq(cabinets.masterCode, "B12"))
      .limit(1);
    return row ?? null;
  }

  it("rejects non-admin callers", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(caller.masterChanges.list({ status: "pending" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("submit files a pending request with side-by-side values and does NOT change the master; reject closes it", async () => {
    const target = await pickCabinet();
    if (!target) return; // no DB in this environment
    const db = (await getDb())!;
    const [before] = await db.select().from(cabinets).where(eq(cabinets.id, target.id)).limit(1);
    const admin = appRouter.createCaller(adminCtx());

    const newDepth = before.depth === "23.75" ? "23.5" : "23.75";
    const submitted = await admin.masterChanges.submit({
      cabinetId: target.id,
      sourceDistributorId: target.distributorId,
      proposed: { depth: newDepth },
    });
    expect(submitted.requestId).not.toBeNull();
    createdIds.push(submitted.requestId!);
    expect(submitted.changes).toBe(1);

    // master untouched
    const [after] = await db.select().from(cabinets).where(eq(cabinets.id, target.id)).limit(1);
    expect(after.depth).toBe(before.depth);

    const pending = await admin.masterChanges.list({ status: "pending" });
    const mine = pending.find((r) => r.id === submitted.requestId);
    expect(mine).toBeTruthy();
    expect(mine!.masterCode).toBe(target.masterCode);
    expect(mine!.changes).toEqual([{ field: "depth", currentValue: before.depth ?? null, proposedValue: newDepth }]);
    expect(mine!.affectedDistributors.some((d) => d.id === target.distributorId)).toBe(true);
    expect(mine!.sourceDistributorName).toBeTruthy();
    expect(mine!.submittedByName).toBe("Master Changes Test Admin");

    // identical proposal = no request
    const noop = await admin.masterChanges.submit({ cabinetId: target.id, proposed: { depth: before.depth ?? null } });
    expect(noop.requestId).toBeNull();

    await admin.masterChanges.reject({ id: submitted.requestId!, note: "test cleanup" });
    const history = await admin.masterChanges.list({ status: "history" });
    const rejected = history.find((r) => r.id === submitted.requestId);
    expect(rejected?.status).toBe("rejected");
    expect(rejected?.reviewNote).toBe("test cleanup");
    expect(rejected?.canUndo).toBe(false);
    await expect(admin.masterChanges.reject({ id: submitted.requestId!, note: "again" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // master still untouched after the whole flow
    const [final] = await db.select().from(cabinets).where(eq(cabinets.id, target.id)).limit(1);
    expect(final.depth).toBe(before.depth);
  });

  it("applyToDistributor writes ONLY that distributor's rule (master unchanged) and undo removes it", async () => {
    const target = await pickCabinet();
    if (!target) return;
    const db = (await getDb())!;
    const admin = appRouter.createCaller(adminCtx());
    const [before] = await db.select().from(cabinets).where(eq(cabinets.id, target.id)).limit(1);
    const [existingOverride] = await db
      .select()
      .from(distributorCabinetOverrides)
      .where(and(eq(distributorCabinetOverrides.cabinetId, target.id), eq(distributorCabinetOverrides.distributorId, target.distributorId)))
      .limit(1);
    // Do not disturb a distributor that already has a real rule.
    if (existingOverride?.configJson) return;
    touchedOverride = { distributorId: target.distributorId, cabinetId: target.id, hadRowBefore: Boolean(existingOverride) };

    const proposedShelves = (before.numberOfAdjShelves ?? 0) === 1 ? 2 : 1;
    const submitted = await admin.masterChanges.submit({
      cabinetId: target.id,
      sourceDistributorId: target.distributorId,
      proposed: { numberOfAdjShelves: proposedShelves },
    });
    expect(submitted.requestId).not.toBeNull();
    createdIds.push(submitted.requestId!);

    await admin.masterChanges.applyToDistributor({ id: submitted.requestId!, distributorId: target.distributorId });
    const [afterMaster] = await db.select().from(cabinets).where(eq(cabinets.id, target.id)).limit(1);
    expect(afterMaster.numberOfAdjShelves).toBe(before.numberOfAdjShelves);

    const rule = await admin.cabinetOverrides.configForCabinet({ cabinetId: target.id });
    const mine = rule.find((r) => r.distributorId === target.distributorId);
    expect(mine?.config).toEqual({ numberOfAdjShelves: proposedShelves });

    const history = await admin.masterChanges.list({ status: "history" });
    const applied = history.find((r) => r.id === submitted.requestId);
    expect(applied?.status).toBe("applied_to_distributor");
    expect(applied?.withinRevertWindow).toBe(true);
    expect(applied?.canUndo).toBe(true);

    await admin.masterChanges.undo({ id: submitted.requestId! });
    const ruleAfterUndo = await admin.cabinetOverrides.configForCabinet({ cabinetId: target.id });
    const mineAfter = ruleAfterUndo.find((r) => r.distributorId === target.distributorId);
    expect(mineAfter?.config ?? {}).toEqual({});
    const history2 = await admin.masterChanges.list({ status: "history" });
    expect(history2.find((r) => r.id === submitted.requestId)?.status).toBe("undone");
  });
});
