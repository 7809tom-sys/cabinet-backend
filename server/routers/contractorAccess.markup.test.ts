import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliateContractorMarkups } from "../../drizzle/schema";

const { getDbMock, getPricingSettingsMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  getPricingSettingsMock: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: getDbMock,
  getPricingSettings: getPricingSettingsMock,
}));

import { contractorAccessRouter } from "./contractorAccess";

function caller(user: { id: number; role: string; email: string | null }) {
  return contractorAccessRouter.createCaller({
    user,
    req: { headers: {} },
    res: {},
  } as never);
}

describe("contractorAccess affiliate markup", () => {
  let markups: Array<{ affiliateUserId: number; markupBps: number; updatedByUserId: number | null }>;

  beforeEach(() => {
    markups = [];
    getPricingSettingsMock.mockReset();
    getPricingSettingsMock.mockResolvedValue({
      globalMarkupBps: 10000,
      homeownerMarkupBps: 15800,
      contractorMarkupBps: 12900,
      wholesaleMarkupBps: 12500,
      wholesaleIncreaseRequiresApproval: true,
      updatedAt: null,
    });
    getDbMock.mockReset();
    getDbMock.mockResolvedValue({
      select: () => ({
        from: (table: unknown) => {
          const rows = table === affiliateContractorMarkups ? markups : [];
          const builder = {
            where: () => builder,
            limit: async (count: number) => rows.slice(0, count),
          };
          return builder;
        },
      }),
      insert: (table: unknown) => ({
        values: (values: { affiliateUserId: number; markupBps: number; updatedByUserId: number | null }) => ({
          onDuplicateKeyUpdate: async ({ set }: { set: { markupBps: number; updatedByUserId: number | null } }) => {
            if (table !== affiliateContractorMarkups) throw new Error("unexpected insert");
            const existing = markups.find((row) => row.affiliateUserId === values.affiliateUserId);
            if (existing) {
              existing.markupBps = set.markupBps;
              existing.updatedByUserId = set.updatedByUserId;
            } else {
              markups.push({ ...values, ...set });
            }
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: async () => {
          if (table !== affiliateContractorMarkups) throw new Error("unexpected delete");
          markups.length = 0;
        },
      }),
    });
  });

  it("returns null markup and the site default percent for an affiliate who has not set one", async () => {
    const result = await caller({ id: 9, role: "partner", email: "ada@shop.test" }).affiliateMarkup();
    expect(result).toEqual({ markupPercent: null, siteDefaultPercent: 29 });
  });

  it("saves, reads, and clears an affiliate markup, and lets an admin do it for any affiliate", async () => {
    const affiliate = caller({ id: 9, role: "affiliate", email: "ada@shop.test" });
    const saved = await affiliate.setAffiliateMarkup({ markupPercent: 29.5 });
    expect(saved).toEqual({ markupPercent: 29.5, siteDefaultPercent: 29 });
    expect(markups).toEqual([{ affiliateUserId: 9, markupBps: 2950, updatedByUserId: 9 }]);
    await expect(affiliate.affiliateMarkup()).resolves.toEqual({ markupPercent: 29.5, siteDefaultPercent: 29 });

    await expect(caller({ id: 4, role: "partner", email: "other@shop.test" }).setAffiliateMarkup({
      affiliateUserId: 9,
      markupPercent: 10,
    })).rejects.toMatchObject({ code: "FORBIDDEN", message: "You can only change your own contractor markup." });

    const admin = caller({ id: 2, role: "admin", email: "rich@shop.test" });
    await expect(admin.affiliateMarkup({ affiliateUserId: 9 })).resolves.toEqual({
      markupPercent: 29.5,
      siteDefaultPercent: 29,
    });
    await admin.setAffiliateMarkup({ affiliateUserId: 9, markupPercent: 0 });
    expect(markups[0]).toMatchObject({ affiliateUserId: 9, markupBps: 0, updatedByUserId: 2 });
    await admin.setAffiliateMarkup({ affiliateUserId: 9, markupPercent: null });
    expect(markups).toEqual([]);

    await expect(caller({ id: 8, role: "contractor", email: "pat@shop.test" }).affiliateMarkup())
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Only an affiliate can set contractor markup." });
    await expect(affiliate.setAffiliateMarkup({ markupPercent: 200.01 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(affiliate.setAffiliateMarkup({ markupPercent: 10.001 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
