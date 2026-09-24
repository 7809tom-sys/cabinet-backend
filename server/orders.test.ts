import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { normalizeCode } from "../shared/cabinetCodeMatch";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function userCtx(role: "user" | "admin"): TrpcContext {
  return {
    user: { id: 1, openId: "o1", name: "T", email: "t@x.com", role } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("orders.extractFromCsv", () => {
  it("matches known cabinet codes from CSV", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.orders.extractFromCsv({ csv: "code,qty\nB-24,2\nZZZ-99,1" });
    expect(res.lines).toHaveLength(2);
    const b24 = res.lines.find((l) => l.normalized === "B-24");
    expect(b24?.matched).toBe(true);
    expect(b24?.qty).toBe(2);
    const unknown = res.lines.find((l) => l.rawCode === "ZZZ-99");
    expect(unknown?.matched).toBe(false);
    expect(res.matchedCount + res.unmatchedCount).toBe(2);
  });

  it("rejects empty CSV", async () => {
    const caller = appRouter.createCaller(publicCtx());
    await expect(caller.orders.extractFromCsv({ csv: "   " })).rejects.toThrow();
  });
});

describe("orders.touchUpKit", () => {
  it("resolves the touch-up kit accessory (TUK) for the checkout suggestion", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const kit = await caller.orders.touchUpKit();
    // TUK is seeded as an active Accessory, so it must resolve.
    expect(kit).not.toBeNull();
    expect(kit?.masterCode).toBe("TUK");
    expect(typeof kit?.id).toBe("number");
    expect((kit?.id ?? 0)).toBeGreaterThan(0);
    expect(typeof kit?.description).toBe("string");
  });

  it("the resolved touch-up kit carries a real price (not a quote-only line)", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const kit = await caller.orders.touchUpKit();
    expect(kit).not.toBeNull();
    // Find a door style that can fulfill the kit, then price it.
    const styles = await caller.orders.stylesForCabinets({ cabinetIds: [kit!.id] });
    expect(styles.length).toBeGreaterThan(0);
    const priced = await caller.orders.priceLines({
      cabinetIds: [kit!.id],
      styleId: styles[0].styleId,
      tier: "Contractor",
    });
    const row = priced.prices.find((p) => p.cabinetId === kit!.id);
    expect(row?.unitPrice).not.toBeNull();
    expect(row!.unitPrice!).toBeGreaterThan(0);
  });

  it("returns owner-only myCost (wholesale floor) ONLY to admins", async () => {
    const pub = appRouter.createCaller(publicCtx());
    const kit = await pub.orders.touchUpKit();
    expect(kit).not.toBeNull();
    const styles = await pub.orders.stylesForCabinets({ cabinetIds: [kit!.id] });
    expect(styles.length).toBeGreaterThan(0);
    const styleId = styles[0].styleId;

    // Anonymous / non-admin: myCost must be null (base cost never leaves the server).
    const anon = await pub.orders.priceLines({ cabinetIds: [kit!.id], styleId, tier: "Contractor" });
    expect(anon.prices[0]?.myCost ?? null).toBeNull();

    const userOnly = appRouter.createCaller(userCtx("user"));
    const asUser = await userOnly.orders.priceLines({ cabinetIds: [kit!.id], styleId, tier: "Contractor" });
    expect(asUser.prices[0]?.myCost ?? null).toBeNull();

    // Admin: myCost present and positive (wholesale floor).
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const asAdmin = await adminCaller.orders.priceLines({ cabinetIds: [kit!.id], styleId, tier: "Contractor" });
    const arow = asAdmin.prices.find((p) => p.cabinetId === kit!.id);
    expect(arow?.myCost).not.toBeNull();
    expect(arow!.myCost!).toBeGreaterThan(0);
    // The wholesale floor must not exceed the contractor sell price.
    expect(arow!.myCost!).toBeLessThanOrEqual(arow!.unitPrice!);
  });
});

describe("orders.recommendAddOns", () => {
  it("returns style-scoped accessory recommendations with prices", async () => {
    const caller = appRouter.createCaller(publicCtx());
    // Pick a style that can fulfill the touch-up kit so we know the style is real.
    const kit = await caller.orders.touchUpKit();
    expect(kit).not.toBeNull();
    const styles = await caller.orders.stylesForCabinets({ cabinetIds: [kit!.id] });
    expect(styles.length).toBeGreaterThan(0);
    const styleId = styles[0].styleId;

    const rec = await caller.orders.recommendAddOns({ styleId, cabinetIds: [], tier: "Contractor" });
    // Shape: every group is an array.
    expect(Array.isArray(rec.touchUpKit)).toBe(true);
    expect(Array.isArray(rec.rollOutTrays)).toBe(true);
    expect(Array.isArray(rec.endPanels)).toBe(true);
    expect(Array.isArray(rec.molding)).toBe(true);
    expect(Array.isArray(rec.fillers)).toBe(true);

    // The catalog has crown molding + fillers in every active style, so at least
    // one of those groups must resolve to a buyable, priced item.
    const all = [
      ...rec.touchUpKit,
      ...rec.rollOutTrays,
      ...rec.endPanels,
      ...rec.molding,
      ...rec.fillers,
    ];
    expect(all.length).toBeGreaterThan(0);
    const priced = all.filter((r) => r.unitPrice !== null);
    expect(priced.length).toBeGreaterThan(0);
    priced.forEach((r) => expect(r.unitPrice!).toBeGreaterThan(0));
  });

  it("excludes items already on the order from the recommendations", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const kit = await caller.orders.touchUpKit();
    const styles = await caller.orders.stylesForCabinets({ cabinetIds: [kit!.id] });
    const styleId = styles[0].styleId;

    const before = await caller.orders.recommendAddOns({ styleId, cabinetIds: [], tier: "Contractor" });
    const beforeIds = new Set(
      [...before.touchUpKit, ...before.molding, ...before.fillers, ...before.endPanels, ...before.rollOutTrays].map(
        (r) => r.id
      )
    );
    expect(beforeIds.size).toBeGreaterThan(0);
    const someId = Array.from(beforeIds)[0];

    const after = await caller.orders.recommendAddOns({
      styleId,
      cabinetIds: [someId],
      tier: "Contractor",
    });
    const afterIds = new Set(
      [...after.touchUpKit, ...after.molding, ...after.fillers, ...after.endPanels, ...after.rollOutTrays].map(
        (r) => r.id
      )
    );
    expect(afterIds.has(someId)).toBe(false);
  });
});

describe("orders.matchCodes", () => {
  it("matches manual shorthand codes", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const res = await caller.orders.matchCodes({ items: [{ code: "B24", qty: 1 }] });
    // The current canonical display code can legitimately be B24 or B-24;
    // the customer shorthand must resolve to the exact same master identity.
    expect(normalizeCode(res.lines[0].masterCode ?? "")).toBe("B24");
  });
});

describe("orders.createRequest + confirm", () => {
  it("creates a draft request and confirms it", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const created = await caller.orders.createRequest({
      originatorEmail: "buyer@example.com",
      source: "manual",
      tier: "Contractor",
      lineItems: [
        {
          cabinetId: null,
          masterCode: "B-24",
          description: "24in Base",
          qty: 2,
          unitPrice: 100,
          linePrice: 200,
          matched: true,
        },
      ],
      notes: "vitest order request",
    });
    expect(created.id).toBeGreaterThan(0);

    const confirmed = await caller.orders.confirm({ id: created.id });
    expect(confirmed.status).toBe("confirmed");
  });

  it("rejects an order request with no line items", async () => {
    const caller = appRouter.createCaller(publicCtx());
    await expect(
      caller.orders.createRequest({
        source: "manual",
        tier: "Contractor",
        lineItems: [],
      })
    ).rejects.toThrow();
  });
});

describe("orders.saveAlias + alias-aware matching", () => {
  it("remembers a manual fix so a previously-unmatched code resolves next time", async () => {
    const caller = appRouter.createCaller(publicCtx());
    // A nonsense code that the matcher cannot resolve on its own.
    const weird = `ZQX${Date.now() % 100000}`;
    const before = await caller.orders.matchCodes({ items: [{ code: weird, qty: 1 }] });
    expect(before.lines[0].matched).toBe(false);

    // Resolve B-24 to a real cabinet id via stylesForCabinets/touchUpKit path:
    // simplest is to look up an active cabinet through extractFromCsv on B-24.
    const known = await caller.orders.matchCodes({ items: [{ code: "B-24", qty: 1 }] });
    const cabinetId = known.lines[0].cabinetId;
    expect(cabinetId).not.toBeNull();

    // Save the alias, then the weird code should now resolve to that cabinet.
    const saved = await caller.orders.saveAlias({ rawCode: weird, cabinetId: cabinetId! });
    expect(saved.ok).toBe(true);

    const after = await caller.orders.matchCodes({ items: [{ code: weird.toLowerCase(), qty: 1 }] });
    expect(after.lines[0].matched).toBe(true);
    expect(after.lines[0].cabinetId).toBe(cabinetId);
  });

  it("rejects saving an alias to an unknown cabinet", async () => {
    const caller = appRouter.createCaller(publicCtx());
    await expect(
      caller.orders.saveAlias({ rawCode: "WHATEVER1", cabinetId: 99999999 })
    ).rejects.toThrow();
  });
});

describe("orders.getAliases", () => {
  it("is admin-only", async () => {
    const userCaller = appRouter.createCaller(userCtx("user"));
    await expect(userCaller.orders.getAliases()).rejects.toThrow();
    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const list = await adminCaller.orders.getAliases();
    expect(Array.isArray(list)).toBe(true);
  });
});

describe("orders.adminList", () => {
  it("only admins can list order requests", async () => {
    const userCaller = appRouter.createCaller(userCtx("user"));
    await expect(userCaller.orders.adminList()).rejects.toThrow();

    const adminCaller = appRouter.createCaller(userCtx("admin"));
    const list = await adminCaller.orders.adminList();
    expect(Array.isArray(list)).toBe(true);
  });
});
