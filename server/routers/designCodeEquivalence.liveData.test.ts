import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const SKYLINE = 180001;
const MADISON = 210002;
const ERB36_ID = 9360042; // Skyline code
const BER36_ID = 9390244; // Madison code
const BT9_ID = 9390192;
const MADISON_STYLE = 330014;
const W362424_ID = 9360131;
const IROY_DUNE_STYLE = 330028;

describe("Two-way code equivalence pricing against live catalog data", () => {
  it("prices a Skyline ERB36 placed on a Madison line through BER36 and reports the swap", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: ERB36_ID, styleId: MADISON_STYLE, masterCode: "ERB36" }],
      distributorId: MADISON,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].cabinetId).toBe(ERB36_ID); // client price map key is stable
    expect(rows[0].resolvedMasterCode).toBe("BER36");
    expect(rows[0].resolvedCabinetId).toBe(BER36_ID);
    expect(rows[0].aliasSwapped).toBe(true);
    expect(Number(rows[0].contractorPrice)).toBeGreaterThan(0);
    // Must equal BER36's own Madison price exactly — no invented number.
    const [direct] = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: BER36_ID, styleId: MADISON_STYLE, masterCode: "BER36" }],
      distributorId: MADISON,
    });
    expect(direct.aliasSwapped).toBe(false);
    expect(rows[0].contractorPrice).toBe(direct.contractorPrice);
    expect(rows[0].homeownerPrice).toBe(direct.homeownerPrice);
  });

  it("keeps the exact code when the active line sells it (no swap on Skyline for ERB36)", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const [skylineStyle] = await db.execute(
      `SELECT styleId FROM distributor_skus WHERE cabinetId = ${ERB36_ID} AND distributorId = ${SKYLINE} AND isPublished = 1 AND isAvailable = 1 LIMIT 1`,
    ) as unknown as Array<Array<{ styleId: number }>>;
    const styleId = Number(skylineStyle?.[0]?.styleId);
    if (!styleId) return;
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: ERB36_ID, styleId, masterCode: "ERB36" }],
      distributorId: SKYLINE,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].resolvedMasterCode).toBe("ERB36");
    expect(rows[0].aliasSwapped).toBe(false);
  });

  it("returns nothing (Part 1 flag) when no member of the group is priced on the line", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    // Ashford (210001) sells neither ERB36 nor BER36 (it uses LS3612, a 36in-deep body that is NOT an equivalent).
    const [ashfordStyle] = await db.execute(
      `SELECT styleId FROM distributor_skus WHERE distributorId = 210001 AND isPublished = 1 AND isAvailable = 1 LIMIT 1`,
    ) as unknown as Array<Array<{ styleId: number }>>;
    const styleId = Number(ashfordStyle?.[0]?.styleId);
    if (!styleId) return;
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: ERB36_ID, styleId, masterCode: "ERB36" }],
      distributorId: 210001,
    });
    expect(rows).toHaveLength(0);
  });

  it("resolves a BT09 spelling to the Madison BT9 row (single leading zero rule)", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: BT9_ID, styleId: MADISON_STYLE, masterCode: "BT09" }],
      distributorId: MADISON,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].resolvedMasterCode).toBe("BT9");
    expect(rows[0].aliasSwapped).toBe(false);
  });

  it("prices the active exact W362424 Iroy Dune cabinet after the retired-link repair", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(publicCtx());
    const rows = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: W362424_ID, styleId: IROY_DUNE_STYLE, masterCode: "W362424" }],
      distributorId: MADISON,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].cabinetId).toBe(W362424_ID);
    expect(rows[0].resolvedCabinetId).toBe(W362424_ID);
    expect(rows[0].resolvedMasterCode).toBe("W362424");
    expect(rows[0].aliasSwapped).toBe(false);
    expect(Number(rows[0].homeownerPrice)).toBeGreaterThan(0);
  });
});
