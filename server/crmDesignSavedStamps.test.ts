import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  crmDesignStampColumnsAvailable,
  resetCrmDesignStampColumnsCache,
  stampCrmDealsDesignSaved,
  stampCrmDealsForDesignSave,
  stampCrmDealsFromLinkedDesigns,
  withCrmDesignSavedStamps,
} from "./lib/crmDesignSavedStamps";

const dialect = new MySqlDialect();

type Deal = { id: number; firstDesignSavedAt: Date | null; lastDesignSavedAt: Date | null; updatedAt: Date };
type Design = { id: number; createdAt: Date; updatedAt: Date };

/**
 * A tiny stand-in for TiDB: it understands the probe, the link lookup, the two
 * stamp UPDATEs and the narrow select, and keeps rows in memory. `dbNow` is the
 * DATABASE clock; the browser never supplies a time.
 */
function fakeDb(opts: { columns: boolean; deals: Deal[]; links?: Array<{ dealId: number; designId: number }>; designs?: Design[] }) {
  const state = { dbNow: new Date("2026-11-23T23:30:00Z"), statements: [] as string[], failWrites: false };
  const links = opts.links ?? [];
  const designs = opts.designs ?? [];
  const execute = async (query: any) => {
    const { sql, params } = dialect.sqlToQuery(query);
    const text = sql.replace(/\s+/g, " ").trim();
    state.statements.push(text);
    if (text.includes("information_schema.columns")) return [[{ columnCount: opts.columns ? 2 : 0 }]];
    if (!opts.columns && /firstDesignSavedAt|lastDesignSavedAt/.test(text)) {
      throw Object.assign(new Error("Unknown column 'firstDesignSavedAt' in 'field list'"), { code: "ER_BAD_FIELD_ERROR" });
    }
    if (text.startsWith("SELECT DISTINCT dealId FROM crm_deal_designs")) {
      const designId = Number(params[0]);
      return [Array.from(new Set(links.filter((l) => l.designId === designId).map((l) => l.dealId))).map((dealId) => ({ dealId }))];
    }
    if (text.startsWith("UPDATE crm_deals SET firstDesignSavedAt = COALESCE(firstDesignSavedAt, NOW())")) {
      if (state.failWrites) throw new Error("write failed");
      expect(text).toContain("updatedAt = updatedAt");
      for (const id of params.map(Number)) {
        const deal = opts.deals.find((d) => d.id === id);
        if (!deal) continue;
        deal.firstDesignSavedAt = deal.firstDesignSavedAt ?? new Date(state.dbNow);
        deal.lastDesignSavedAt = new Date(state.dbNow);
      }
      return [{ affectedRows: params.length }];
    }
    if (text.startsWith("UPDATE crm_deals d JOIN")) {
      expect(text).toContain("d.updatedAt = d.updatedAt");
      for (const id of params.map(Number)) {
        const deal = opts.deals.find((d) => d.id === id);
        const linked = links.filter((l) => l.dealId === id).map((l) => designs.find((d) => d.id === l.designId)).filter((d): d is Design => !!d);
        if (!deal || linked.length === 0) continue;
        const firstAt = new Date(Math.min(...linked.map((d) => d.createdAt.getTime())));
        const lastAt = new Date(Math.max(...linked.map((d) => Math.max(d.createdAt.getTime(), d.updatedAt.getTime()))));
        deal.firstDesignSavedAt = deal.firstDesignSavedAt ?? firstAt;
        if (deal.lastDesignSavedAt == null || lastAt > deal.lastDesignSavedAt) deal.lastDesignSavedAt = lastAt;
      }
      return [{}];
    }
    throw new Error(`unexpected statement: ${text}`);
  };
  const select = () => ({
    from: () => ({
      where: async () => {
        if (!opts.columns) throw new Error("Unknown column 'firstDesignSavedAt'");
        return opts.deals.map((d) => ({ id: d.id, firstDesignSavedAt: d.firstDesignSavedAt, lastDesignSavedAt: d.lastDesignSavedAt }));
      },
    }),
  });
  return { db: { execute, select }, state };
}

const deal = (id: number): Deal => ({ id, firstDesignSavedAt: null, lastDesignSavedAt: null, updatedAt: new Date("2026-11-01T12:00:00Z") });

beforeEach(() => resetCrmDesignStampColumnsCache());

describe("CRM contact design-saved stamps", () => {
  it("the first save sets both dates from the database clock", async () => {
    const d = deal(1);
    const { db, state } = fakeDb({ columns: true, deals: [d] });
    expect(await stampCrmDealsDesignSaved(db, [1])).toBe(1);
    expect(d.firstDesignSavedAt?.toISOString()).toBe("2026-11-23T23:30:00.000Z");
    expect(d.lastDesignSavedAt?.toISOString()).toBe("2026-11-23T23:30:00.000Z");
    // The statement uses NOW(); no time value is ever passed in from the caller.
    expect(state.statements.at(-1)).toContain("NOW()");
  });

  it("later saves move the last date but never change the first date", async () => {
    const d = deal(2);
    const { db, state } = fakeDb({ columns: true, deals: [d] });
    await stampCrmDealsDesignSaved(db, [2]);
    state.dbNow = new Date("2026-11-30T15:00:00Z");
    await stampCrmDealsDesignSaved(db, [2]);
    expect(d.firstDesignSavedAt?.toISOString()).toBe("2026-11-23T23:30:00.000Z");
    expect(d.lastDesignSavedAt?.toISOString()).toBe("2026-11-30T15:00:00.000Z");
  });

  it("does not bump the deal's updatedAt", async () => {
    const d = deal(3);
    const { db } = fakeDb({ columns: true, deals: [d] });
    await stampCrmDealsDesignSaved(db, [3]);
    expect(d.updatedAt.toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });

  it("a guest (email-gate) contact is stamped when a design linked to it is saved", async () => {
    // captureLead created deal 40 for the guest; the save linked design 900 to it.
    const guestDeal = deal(40);
    const other = deal(41);
    const { db } = fakeDb({ columns: true, deals: [guestDeal, other], links: [{ dealId: 40, designId: 900 }] });
    expect(await stampCrmDealsForDesignSave(db, 900)).toBe(1);
    expect(guestDeal.firstDesignSavedAt).not.toBeNull();
    expect(other.firstDesignSavedAt).toBeNull();
  });

  it("linking an existing design stamps from the design's own save times, keeping an earlier first date", async () => {
    const fresh = deal(50);
    const already = { ...deal(51), firstDesignSavedAt: new Date("2026-10-01T10:00:00Z"), lastDesignSavedAt: new Date("2026-10-02T10:00:00Z") };
    const { db } = fakeDb({
      columns: true,
      deals: [fresh, already],
      links: [{ dealId: 50, designId: 7 }, { dealId: 51, designId: 7 }],
      designs: [{ id: 7, createdAt: new Date("2026-11-05T09:00:00Z"), updatedAt: new Date("2026-11-20T09:00:00Z") }],
    });
    await stampCrmDealsFromLinkedDesigns(db, [50, 51]);
    expect(fresh.firstDesignSavedAt?.toISOString()).toBe("2026-11-05T09:00:00.000Z");
    expect(fresh.lastDesignSavedAt?.toISOString()).toBe("2026-11-20T09:00:00.000Z");
    expect(already.firstDesignSavedAt?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(already.lastDesignSavedAt?.toISOString()).toBe("2026-11-20T09:00:00.000Z");
  });

  it("missing columns (0284 not run) never crash: stamping is skipped and reads return NULL", async () => {
    const d = deal(60);
    const { db, state } = fakeDb({ columns: false, deals: [d] });
    expect(await crmDesignStampColumnsAvailable(db)).toBe(false);
    expect(await stampCrmDealsDesignSaved(db, [60])).toBe(0);
    expect(await stampCrmDealsForDesignSave(db, 900)).toBe(0);
    expect(await stampCrmDealsFromLinkedDesigns(db, [60])).toBe(0);
    const rows = await withCrmDesignSavedStamps(db, [{ id: 60, title: "x" }]);
    expect(rows).toEqual([{ id: 60, title: "x", firstDesignSavedAt: null, lastDesignSavedAt: null }]);
    // Only the information_schema probe ran (cached for a minute); no UPDATE was attempted.
    expect(state.statements.every((s) => s.includes("information_schema"))).toBe(true);
  });

  it("a failed stamp write is swallowed so the design save still succeeds", async () => {
    const { db, state } = fakeDb({ columns: true, deals: [deal(70)] });
    state.failWrites = true;
    await expect(stampCrmDealsDesignSaved(db, [70])).resolves.toBe(0);
  });

  it("ignores empty or invalid ids without touching the database", async () => {
    const { db, state } = fakeDb({ columns: true, deals: [] });
    expect(await stampCrmDealsDesignSaved(db, [null, undefined, 0, -1])).toBe(0);
    expect(await stampCrmDealsForDesignSave(db, null)).toBe(0);
    expect(state.statements).toEqual([]);
  });

  it("decorates CRM rows with the stored dates", async () => {
    const d = { ...deal(80), firstDesignSavedAt: new Date("2026-11-10T00:00:00Z"), lastDesignSavedAt: new Date("2026-11-12T00:00:00Z") };
    const { db } = fakeDb({ columns: true, deals: [d] });
    const [row] = await withCrmDesignSavedStamps(db, [{ id: 80 }, { id: 81 }]);
    expect(row.firstDesignSavedAt?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
    expect(row.lastDesignSavedAt?.toISOString()).toBe("2026-11-12T00:00:00.000Z");
  });
});

describe("every design save path stamps the CRM contact", () => {
  const read = (file: string) => readFileSync(join(__dirname, file), "utf8");

  it("design.save (new and existing, signed-in, guest/email-gate and Auto Design saves) stamps inside linkDesignToCrmDeal", () => {
    const src = read("routers/design.ts");
    const fn = src.slice(src.indexOf("async function linkDesignToCrmDeal"), src.indexOf("export async function logDesignView"));
    // The lead lookup (email gate) resolves the deal first; the stamp uses that resolved deal.
    expect(fn.indexOf("designLeads.email")).toBeGreaterThan(-1);
    expect(fn).toContain("await stampCrmDealsDesignSaved(db, [dealId]);");
    expect(fn.lastIndexOf("stampCrmDealsDesignSaved")).toBeGreaterThan(fn.indexOf("insert(crmDealDesigns)"));
    const save = src.slice(src.indexOf("  save: protectedProcedure"), src.indexOf("  autosave: protectedProcedure"));
    expect(save.match(/linkDesignToCrmDeal\(/g)?.length).toBe(2);
  });

  it("autosave, revert, copy and designer-assist saves stamp the linked contacts", () => {
    const design = read("routers/design.ts");
    const autosave = design.slice(design.indexOf("  autosave: protectedProcedure"));
    expect(autosave.slice(0, autosave.indexOf("return { id: input.id };"))).toContain("stampCrmDealsForDesignSave(db, input.id)");
    const account = read("routers/customerAccount.ts");
    expect(account.match(/stampCrmDealsForDesignSave\(db, design\.id\)/g)?.length).toBe(2);
    const assist = read("routers/designAssist.ts");
    expect(assist.match(/stampCrmDealsForDesignSave\(db, design\.id\)/g)?.length).toBe(2);
  });

  it("every place that links a saved design to a deal fills the dates from the design", () => {
    expect(read("routers/crm.ts").match(/stampCrmDealsFromLinkedDesigns\(db, \[/g)?.length).toBe(3);
    for (const file of ["routers/contractorPortal.ts", "routers/designPhotoRenders.ts", "routers/orders.ts", "routers/installationEstimates.ts"]) {
      expect(read(file)).toContain("stampCrmDealsFromLinkedDesigns(db, [");
    }
  });

  it("the stamp columns stay off the main crmDeals table object", () => {
    const schema = readFileSync(join(__dirname, "..", "drizzle", "schema.ts"), "utf8");
    expect(schema).not.toContain("firstDesignSavedAt");
    expect(schema).not.toContain("lastDesignSavedAt");
  });
});
