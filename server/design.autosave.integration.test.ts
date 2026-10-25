import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { kitchenDesigns } from "../drizzle/schema";

const OWNER_ID = 987_654_321;
const OTHER_USER_ID = 987_654_322;

function callerFor(id: number): ReturnType<typeof appRouter.createCaller> {
  return appRouter.createCaller({
    user: {
      id,
      openId: `autosave-test-${id}`,
      name: "Autosave Test",
      email: `autosave-${id}@example.test`,
      role: "user",
    },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => {} },
  } as unknown as TrpcContext);
}

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  await db.delete(kitchenDesigns).where(
    and(
      eq(kitchenDesigns.name, "__AUTOSAVE_INTEGRATION_TEST__"),
      isNull(kitchenDesigns.affiliateId),
    ),
  );
}

describe("design.autosave integration", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("updates one owned saved plan in place without changing its name or creating another plan", async () => {
    const db = await getDb();
    if (!db) return;
    const inserted = await db.insert(kitchenDesigns).values({
      userId: OWNER_ID,
      affiliateId: null,
      name: "__AUTOSAVE_INTEGRATION_TEST__",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    });
    const id = (inserted as unknown as [{ insertId: number }])[0].insertId;

    const result = await callerFor(OWNER_ID).design.autosave({
      id,
      affiliateSlug: "owner",
      originScope: "owner",
      roomData: { width: 144, depth: 120, persistedEntities: { openings: [], sinks: [], potFillers: [], island: null, furniture: [], ponyWalls: [] } },
      placedCabinets: [{ uid: "autosave-b24", cabinetId: 1, x: 0, y: 0, rotation: 0 }],
      selectedSurfaces: [{ id: 1, name: "Exact sample" }],
      threeDPresentation: { cabinetFinish: "#ffffff" },
      selectedStyleId: 1,
      selectedDistributorId: 1,
      roomType: "kitchen",
    });

    expect(result).toEqual({ id });
    const rows = await db.select().from(kitchenDesigns).where(eq(kitchenDesigns.userId, OWNER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      name: "__AUTOSAVE_INTEGRATION_TEST__",
      roomType: "kitchen",
      selectedStyleId: 1,
      selectedDistributorId: 1,
    });
    expect(rows[0]?.roomData).toMatchObject({ width: 144, depth: 120 });
    expect(rows[0]?.placedCabinets).toEqual([{ uid: "autosave-b24", cabinetId: 1, x: 0, y: 0, rotation: 0 }]);
  });

  it("rejects an automatic update for a saved plan owned by another user", async () => {
    const db = await getDb();
    if (!db) return;
    const inserted = await db.insert(kitchenDesigns).values({
      userId: OTHER_USER_ID,
      affiliateId: null,
      name: "__AUTOSAVE_INTEGRATION_TEST__",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    });
    const id = (inserted as unknown as [{ insertId: number }])[0].insertId;

    await expect(callerFor(OWNER_ID).design.autosave({
      id,
      affiliateSlug: "owner",
      roomData: { width: 144, depth: 120 },
      placedCabinets: [],
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
