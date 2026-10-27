import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  affiliateTeamMembers,
  affiliates,
  crmActivities,
  crmDeals,
  designConsultations,
  designerAvailability,
  kitchenDesigns,
} from "../drizzle/schema";
import {
  CONSULTATION_AFFILIATE_BACKFILL_SQL,
  certainConsultationAffiliateId,
  collectConsultationAttribution,
  consultationVisibleToViewer,
  readRequestCookie,
  resolveBookedConsultationAffiliate,
} from "./lib/consultationAffiliate";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("./db", () => ({ getDb: getDbMock }));

import { affiliatesRouter } from "./routers/affiliates";
import { consultationsRouter } from "./routers/consultations";

type Row = Record<string, any>;

type State = {
  affiliates: Row[];
  affiliateTeamMembers: Row[];
  designConsultations: Row[];
  designerAvailability: Row[];
  kitchenDesigns: Row[];
  crmDeals: Row[];
  crmActivities: Row[];
};

function sqlParams(node: unknown, out: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return out;
  const record = node as { queryChunks?: unknown[]; value?: unknown; name?: string };
  if (!Array.isArray(record.queryChunks)) return out;
  for (const chunk of record.queryChunks) {
    if (!chunk || typeof chunk !== "object") continue;
    const part = chunk as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(part.queryChunks)) sqlParams(part, out);
    else if ("value" in part && !Array.isArray(part.value)) out.push(part.value);
  }
  return out;
}

function project(rows: Row[], fields?: Record<string, unknown>) {
  if (!fields) return rows.map((row) => ({ ...row }));
  return rows.map((row) => Object.fromEntries(Object.keys(fields).map((key) => [key, row[key]])));
}

function fakeDb(state: State) {
  return {
    select(fields?: Record<string, unknown>) {
      return {
        from(table: unknown) {
          let rows = rowsFor(state, table).map((row) => ({ ...row }));
          const chain: any = {
            where(condition: unknown) {
              const params = sqlParams(condition);
              const numbers = params.filter((value): value is number => typeof value === "number");
              const strings = params.filter((value): value is string => typeof value === "string");
              if (table === designConsultations) {
                rows = rows.filter((row) => {
                  const affiliateFilter = params.find((value) => typeof value === "number");
                  if (typeof affiliateFilter === "number" && row.affiliateId !== affiliateFilter) return false;
                  if (strings.includes("requested") || strings.includes("confirmed") || strings.includes("completed") || strings.includes("cancelled")) {
                    if (!strings.includes(row.status)) return false;
                  }
                  return true;
                });
              } else if (table === affiliates) {
                rows = rows.filter((row) =>
                  numbers.includes(row.id)
                  || numbers.includes(row.userId)
                  || strings.includes(row.email)
                  || strings.includes(row.slug)
                  || strings.includes(row.referralCode),
                );
              } else if (table === affiliateTeamMembers) {
                rows = rows.filter((row) => row.isActive !== false && (numbers.includes(row.userId) || strings.includes(row.email)));
              } else if (table === designerAvailability || table === kitchenDesigns) {
                rows = rows.filter((row) => numbers.includes(row.id));
              }
              return chain;
            },
            orderBy: () => chain,
            limit: async (count: number) => project(rows.slice(0, count), fields),
          };
          return chain;
        },
      };
    },
    update() {
      return { set: () => ({ where: async () => [{ affectedRows: 1 }] }) };
    },
    insert(table: unknown) {
      return {
        values: async (values: Row) => {
          const rows = rowsFor(state, table);
          const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
          rows.push({ id, ...values });
          return [{ insertId: id }];
        },
      };
    },
  };
}

function rowsFor(state: State, table: unknown): Row[] {
  if (table === affiliates) return state.affiliates;
  if (table === affiliateTeamMembers) return state.affiliateTeamMembers;
  if (table === designConsultations) return state.designConsultations;
  if (table === designerAvailability) return state.designerAvailability;
  if (table === kitchenDesigns) return state.kitchenDesigns;
  if (table === crmDeals) return state.crmDeals;
  if (table === crmActivities) return state.crmActivities;
  throw new Error("Unexpected table");
}

function seed(): State {
  return {
    affiliates: [
      { id: 1, userId: 11, email: "a@example.com", status: "active", storefrontEnabled: true, slug: "alpha", referralCode: "ALPHA" },
      { id: 2, userId: 22, email: "b@example.com", status: "active", storefrontEnabled: true, slug: "beta", referralCode: "BETA" },
      { id: 3, userId: null, email: "closed@example.com", status: "paused", storefrontEnabled: false, slug: "closed", referralCode: "CLOSED" },
    ],
    affiliateTeamMembers: [
      { id: 7, affiliateId: 1, userId: 31, email: "designer@example.com", accessCrm: false, accessDesigner: true, isActive: true },
      { id: 8, affiliateId: 1, userId: 32, email: "blocked@example.com", accessCrm: false, accessDesigner: false, isActive: true },
      { id: 9, affiliateId: 2, userId: 33, email: "crm@example.com", accessCrm: true, accessDesigner: false, isActive: true },
    ],
    designConsultations: [
      { id: 101, affiliateId: 1, status: "requested", customerName: "Ada", customerEmail: "ada@example.com", customerPhone: "111", topic: "A layout", mode: "video", startAt: new Date("2026-11-01T15:00:00Z"), designerName: "Dee", meetingUrl: "https://meet.example/a", shareToken: "secret-a" },
      { id: 102, affiliateId: 2, status: "confirmed", customerName: "Bea", customerEmail: "bea@example.com", customerPhone: "222", topic: "B layout", mode: "phone", startAt: new Date("2026-11-02T15:00:00Z"), designerName: "Dee", meetingUrl: "https://meet.example/b", shareToken: "secret-b" },
      { id: 103, affiliateId: null, status: "requested", customerName: "House", customerEmail: "house@example.com", customerPhone: "333", topic: "House layout", mode: "video", startAt: new Date("2026-11-03T15:00:00Z"), designerName: "Dee", meetingUrl: null, shareToken: "secret-house" },
    ],
    designerAvailability: [
      { id: 5, status: "open", startAt: new Date(Date.now() + 86_400_000), endAt: new Date(Date.now() + 90_000_000), designerUserId: 9, designerName: "Dee", mode: "video" },
    ],
    kitchenDesigns: [
      { id: 50, affiliateId: 1 },
      { id: 51, affiliateId: 2 },
      { id: 52, affiliateId: null },
    ],
    crmDeals: [],
    crmActivities: [],
  };
}

let state: State;

function callerFor(user: { id: number; email: string | null; role: string } | null, headers: Record<string, string> = {}) {
  return {
    affiliates: affiliatesRouter.createCaller({
      user,
      req: { protocol: "https", hostname: "api.cabinetdealz.com", headers },
      res: {},
    } as any),
    consultations: consultationsRouter.createCaller({
      user,
      req: { protocol: "https", hostname: "api.cabinetdealz.com", headers },
      res: {},
    } as any),
  };
}

beforeEach(() => {
  state = seed();
  getDbMock.mockReset();
  getDbMock.mockImplementation(async () => fakeDb(state));
});

describe("affiliates.myConsultations", () => {
  it("forbids a logged-in customer who is not an affiliate", async () => {
    const call = callerFor({ id: 99, email: "customer@example.com", role: "user" }).affiliates.myConsultations();
    await expect(call).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns only affiliate A's bookings and omits share tokens and house rows", async () => {
    const rows = await callerFor({ id: 11, email: "a@example.com", role: "user" }).affiliates.myConsultations({ status: "all" });
    expect(rows.map((row) => row.id)).toEqual([101]);
    expect(rows[0]).toMatchObject({ customerName: "Ada", customerEmail: "ada@example.com", meetingUrl: "https://meet.example/a" });
    expect(JSON.stringify(rows)).not.toContain("secret-");
    expect(rows[0]).not.toHaveProperty("shareToken");
  });

  it("does not let affiliate A request affiliate B's bookings", async () => {
    const call = callerFor({ id: 11, email: "a@example.com", role: "user" }).affiliates.myConsultations({ affiliateId: 2 });
    await expect(call).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets a team member with designer or CRM access see only their affiliate", async () => {
    const designer = await callerFor({ id: 31, email: "designer@example.com", role: "user" }).affiliates.myConsultations();
    expect(designer.map((row) => row.customerEmail)).toEqual(["ada@example.com"]);
    const crm = await callerFor({ id: 33, email: "crm@example.com", role: "user" }).affiliates.myConsultations();
    expect(crm.map((row) => row.customerEmail)).toEqual(["bea@example.com"]);
  });

  it("forbids a team member with neither CRM nor designer access", async () => {
    const call = callerFor({ id: 32, email: "blocked@example.com", role: "user" }).affiliates.myConsultations();
    await expect(call).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets an admin see every booking, or one affiliate when an id is passed", async () => {
    const all = await callerFor({ id: 1, email: "admin@example.com", role: "admin" }).affiliates.myConsultations();
    expect(all.map((row) => row.id).sort()).toEqual([101, 102, 103]);
    const one = await callerFor({ id: 1, email: "admin@example.com", role: "admin" }).affiliates.myConsultations({ affiliateId: 2 });
    expect(one.map((row) => row.id)).toEqual([102]);
    await expect(
      callerFor({ id: 1, email: "admin@example.com", role: "admin" }).affiliates.myConsultations({ affiliateId: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("consultation booking attribution", () => {
  it("stores the affiliate resolved from the storefront slug, not a client id", async () => {
    const result = await callerFor(null).consultations.book({
      slotId: 5,
      customerName: "Ada",
      customerEmail: "ada@example.com",
      affiliateSlug: "alpha",
      referralCode: "alpha",
      // @ts-expect-error a numeric affiliate id is not part of the booking input
      affiliateId: 2,
    });
    expect(result.ok).toBe(true);
    expect(state.designConsultations.at(-1)).toMatchObject({ affiliateId: 1, customerEmail: "ada@example.com" });
    expect(state.crmDeals.at(-1)).toMatchObject({ affiliateId: 1 });
  });

  it("uses the referral cookie when the page does not send a slug", async () => {
    await callerFor(null, { cookie: "cd_referral_code=BETA" }).consultations.book({
      slotId: 5,
      customerName: "Bea",
      customerEmail: "bea@example.com",
    });
    expect(state.designConsultations.at(-1)?.affiliateId).toBe(2);
  });

  it("rejects a slug and referral that belong to different stores before claiming the slot", async () => {
    await expect(callerFor(null).consultations.book({
      slotId: 5,
      customerName: "Ada",
      customerEmail: "ada@example.com",
      affiliateSlug: "alpha",
      referralCode: "BETA",
    })).rejects.toBeInstanceOf(TRPCError);
    expect(state.designConsultations).toHaveLength(3);
    expect(state.designerAvailability[0]?.status).toBe("open");
  });

  it("rejects a saved design from another store", async () => {
    await expect(callerFor(null).consultations.book({
      slotId: 5,
      customerName: "Ada",
      customerEmail: "ada@example.com",
      affiliateSlug: "alpha",
      designId: 51,
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.crmDeals).toHaveLength(0);
  });
});

describe("consultation affiliate rules", () => {
  it("keeps disagreeing direct links null and uses one lead only when nothing else is known", () => {
    expect(certainConsultationAffiliateId({ designAffiliateId: 1, dealAffiliateId: 2, leadAffiliateIds: [1] })).toBeNull();
    expect(certainConsultationAffiliateId({ designAffiliateId: 1, dealAffiliateId: null, leadAffiliateIds: [2, 9] })).toBe(1);
    expect(certainConsultationAffiliateId({ leadAffiliateIds: [4, 4] })).toBe(4);
    expect(certainConsultationAffiliateId({ leadAffiliateIds: [4, 5] })).toBeNull();
    expect(certainConsultationAffiliateId({})).toBeNull();
  });

  it("rejects mixed storefront signals and resolves one active store", async () => {
    expect(() => collectConsultationAttribution({ affiliateSlug: "alpha", cookieSlug: "beta" })).toThrow(/storefront/i);
    const id = await resolveBookedConsultationAffiliate(
      {
        findBySlug: async () => ({ id: 1, status: "active", storefrontEnabled: true, referralCode: "ALPHA" }),
        findByReferralCode: async () => null,
      },
      { hostSlug: "alpha", referralCode: "missing" },
    );
    expect(id).toBe(1);
    await expect(resolveBookedConsultationAffiliate(
      {
        findBySlug: async () => ({ id: 3, status: "paused", storefrontEnabled: false, referralCode: "CLOSED" }),
        findByReferralCode: async () => null,
      },
      { affiliateSlug: "closed" },
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("hides null affiliate rows from partners and shows them to an unscoped admin", () => {
    expect(consultationVisibleToViewer(null, { role: "affiliate", affiliateId: 1 })).toBe(false);
    expect(consultationVisibleToViewer(2, { role: "affiliate", affiliateId: 1 })).toBe(false);
    expect(consultationVisibleToViewer(1, { role: "affiliate", affiliateId: 1 })).toBe(true);
    expect(consultationVisibleToViewer(null, { role: "admin", affiliateId: null })).toBe(true);
    expect(consultationVisibleToViewer(null, { role: "admin", affiliateId: 1 })).toBe(false);
  });

  it("reads the referral cookie without trusting a raw affiliate id", () => {
    expect(readRequestCookie("cd_affiliate_slug=Alpha; cd_referral_code=be%2Dta", "cd_referral_code")).toBe("be-ta");
    expect(readRequestCookie(undefined, "cd_referral_code")).toBeNull();
  });
});

describe("consultation endpoint scope", () => {
  it("keeps designer list, status, and meeting updates on the assigned designer or an admin", () => {
    const source = readFileSync(new URL("./routers/consultations.ts", import.meta.url), "utf8");
    expect(source).toContain("eq(designConsultations.designerUserId, ctx.user.id)");
    expect(source.match(/cons\.designerUserId !== ctx\.user\.id/g)?.length).toBe(2);
    expect(source).not.toContain("affiliateId: z.number");
  });

  it("ships the certain-only backfill in migration 0207 and does not start it from the server", () => {
    const migration = readFileSync(new URL("../drizzle/0215_consultation_affiliate.sql", import.meta.url), "utf8");
    const journal = readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");
    for (const statement of CONSULTATION_AFFILIATE_BACKFILL_SQL.split(";\n")) {
      expect(migration).toContain(statement.replace(/;\s*$/, ""));
    }
    expect(migration).toContain("COUNT(DISTINCT affiliateId) = 1");
    expect(journal).toContain("0215_consultation_affiliate");
    expect(journal).not.toContain("0207_consultation_affiliate");
    const startup = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    expect(startup).not.toContain("consultation_affiliate");
    expect(startup).not.toContain("CONSULTATION_AFFILIATE_BACKFILL_SQL");
  });
});
