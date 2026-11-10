import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  affiliateDistributorSelections,
  affiliateFeaturePublish,
  affiliates,
  distributors,
  vendorLines,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { memoryStore, type Row } from "./lib/__testDb";
import { AFFILIATE_FEATURE_UNPUBLISHED } from "@shared/affiliateFeaturePublish";

const dbState = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: vi.fn(async () => dbState.current),
}));

import { appRouter } from "./routers";
import { guardAffiliateFeature } from "./lib/affiliateFeaturePublish";

function userOf(role: string, id = 7) {
  return {
    id,
    openId: `${role}-test`,
    name: role === "admin" ? "Tom Admin" : role,
    email: `${role}@example.invalid`,
    role,
    distributorId: null,
    approvedVendorLineId: null,
    passwordHash: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    loginMethod: "test",
    pricingTier: "homeowner",
    companyName: null,
    emailLower: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as TrpcContext["user"];
}

const caller = (user: TrpcContext["user"]) =>
  appRouter.createCaller({
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  });

function publishDatabase() {
  const tables = new Map<unknown, Row[]>();
  const base = memoryStore(tables);
  return {
    ...base,
    insert: (table: unknown) => ({
      values: (values: Row) => ({
        onDuplicateKeyUpdate: async ({ set }: { set: Row }) => {
          const current = tables.get(table) ?? [];
          const index = current.findIndex((row) =>
            row.subjectKind === values.subjectKind
            && row.subjectId === values.subjectId
            && row.featureKey === values.featureKey);
          if (index >= 0) current[index] = { ...current[index], ...set };
          else current.push({ id: current.length + 1, ...values });
          tables.set(table, current);
        },
      }),
    }),
  };
}

beforeEach(() => {
  dbState.current = null;
});

describe("distributorAdmin affiliate feature publish", () => {
  it("is admin only", async () => {
    await expect(caller(userOf("user")).distributorAdmin.listAffiliateFeaturePublish()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(null).distributorAdmin.setAffiliateFeaturePublish({
      subjectKind: "distributor",
      subjectId: 4,
      featureKey: "kitchen_designer",
      published: true,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a feature key the Publish tab does not use", async () => {
    dbState.current = publishDatabase();
    await expect(caller(userOf("admin")).distributorAdmin.setAffiliateFeaturePublish({
      subjectKind: "vendor",
      subjectId: 2,
      featureKey: "literature" as "quote",
      published: true,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("upserts one pair and returns the list the Publish tab reads", async () => {
    dbState.current = publishDatabase();
    const admin = caller(userOf("admin"));
    const saved = await admin.distributorAdmin.setAffiliateFeaturePublish({
      subjectKind: "distributor",
      subjectId: 4,
      featureKey: "bathroom_builder",
      published: true,
    });
    expect(saved).toMatchObject({
      subjectKind: "distributor",
      subjectId: 4,
      featureKey: "bathroom_builder",
      published: true,
      updatedByName: "Tom Admin",
    });
    expect(saved.updatedAt).toEqual(expect.any(String));

    const turnedOff = await admin.distributorAdmin.setAffiliateFeaturePublish({
      subjectKind: "distributor",
      subjectId: 4,
      featureKey: "bathroom_builder",
      published: false,
    });
    expect(turnedOff.published).toBe(false);

    const listed = await admin.distributorAdmin.listAffiliateFeaturePublish();
    expect(listed.rows).toEqual([expect.objectContaining({
      subjectKind: "distributor",
      subjectId: 4,
      featureKey: "bathroom_builder",
      published: false,
      updatedByName: "Tom Admin",
    })]);
  });
});

describe("affiliate feature read rejection", () => {
  function scopeDb(rows: Row[] = []) {
    return memoryStore(new Map<unknown, Row[]>([
      [affiliates, [{ id: 7, slug: "acme" }]],
      [affiliateDistributorSelections, [{ affiliateId: 7, distributorId: 4 }]],
      [distributors, [
        { id: 4, code: "ACME", isActive: true },
        { id: 9, code: "OTHER", isActive: true },
      ]],
      [vendorLines, [
        { id: 2, sourceKey: null, linkedDistributorIds: null },
        { id: 3, sourceKey: "dist:4", linkedDistributorIds: null },
      ]],
      [affiliateFeaturePublish, rows],
    ]));
  }

  it("blocks an affiliate cabinet read until that distributor is published", async () => {
    const db = scopeDb();
    await expect(guardAffiliateFeature(db as never, {
      role: "partner",
      slug: "acme",
      feature: "cabinet_catalog",
      distributorId: 4,
    })).rejects.toMatchObject({ code: "FORBIDDEN", message: AFFILIATE_FEATURE_UNPUBLISHED });

    await expect(guardAffiliateFeature(scopeDb([{
      subjectKind: "distributor",
      subjectId: 4,
      featureKey: "cabinet_catalog",
      published: true,
    }]) as never, {
      role: "partner",
      affiliateId: 7,
      feature: "cabinet_catalog",
      distributorId: 9,
    })).rejects.toBeInstanceOf(TRPCError);
  });

  it("allows the published distributor and still allows admin and house reads", async () => {
    const db = scopeDb([{
      subjectKind: "distributor",
      subjectId: 4,
      featureKey: "cabinet_catalog",
      published: 1,
    }]);
    await expect(guardAffiliateFeature(db as never, {
      role: "partner",
      slug: "acme",
      feature: "cabinet_catalog",
      distributorId: 4,
    })).resolves.toBeUndefined();
    await expect(guardAffiliateFeature(scopeDb() as never, {
      role: "admin",
      slug: "acme",
      feature: "quote",
    })).resolves.toBeUndefined();
    await expect(guardAffiliateFeature(scopeDb() as never, {
      role: "user",
      feature: "quote",
    })).resolves.toBeUndefined();
  });

  it("uses a vendor with no distributor line for every affiliate, and ignores a vendor row that already has a line", async () => {
    await expect(guardAffiliateFeature(scopeDb([{
      subjectKind: "vendor",
      subjectId: 2,
      featureKey: "pelican_catalog",
      published: true,
    }]) as never, {
      role: "partner",
      affiliateId: 7,
      feature: "pelican_catalog",
    })).resolves.toBeUndefined();

    await expect(guardAffiliateFeature(scopeDb([{
      subjectKind: "vendor",
      subjectId: 3,
      featureKey: "samples",
      published: true,
    }]) as never, {
      role: "partner",
      affiliateId: 7,
      feature: "samples",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
