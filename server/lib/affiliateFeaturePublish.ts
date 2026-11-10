import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  AFFILIATE_FEATURE_KEYS,
  AFFILIATE_FEATURE_UNPUBLISHED,
  decideAffiliateFeatureRead,
  publishFlagOn,
  type AffiliateFeatureKey,
  type AffiliateFeaturePublishRow,
  type PublishFlag,
  type PublishSubjectKind,
} from "@shared/affiliateFeaturePublish";
import {
  affiliateDistributorSelections,
  affiliateFeaturePublish,
  affiliates,
  distributors,
  vendorLines,
} from "../../drizzle/schema";
import { approvedVendorLinkedDistributorIds } from "./approvedVendorAccess";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

export const setAffiliateFeaturePublishInput = z.object({
  subjectKind: z.enum(["distributor", "vendor"]),
  subjectId: z.number().int().positive(),
  featureKey: z.enum(AFFILIATE_FEATURE_KEYS),
  published: z.boolean(),
});

export type SetAffiliateFeaturePublishInput = z.infer<typeof setAffiliateFeaturePublishInput>;

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function asIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asKind(value: unknown): PublishSubjectKind | null {
  return value === "distributor" || value === "vendor" ? value : null;
}

export function toAffiliateFeaturePublishRow(row: {
  subjectKind: unknown;
  subjectId: unknown;
  featureKey: unknown;
  published: unknown;
  updatedByName?: unknown;
  updatedAt?: unknown;
}): AffiliateFeaturePublishRow | null {
  const subjectKind = asKind(row.subjectKind);
  const subjectId = Number(row.subjectId);
  if (!subjectKind || !Number.isInteger(subjectId) || subjectId <= 0) return null;
  const featureKey = typeof row.featureKey === "string" ? row.featureKey : "";
  if (!featureKey) return null;
  return {
    subjectKind,
    subjectId,
    featureKey,
    published: asBoolean(row.published),
    updatedByName: typeof row.updatedByName === "string" && row.updatedByName.trim() ? row.updatedByName : null,
    updatedAt: asIso(row.updatedAt),
  };
}

function missingPublishTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /affiliate_feature_publish/i.test(message)
    && /doesn't exist|does not exist|unknown table|no such table/i.test(message);
}

export async function listAffiliateFeaturePublish(db: Database): Promise<AffiliateFeaturePublishRow[]> {
  try {
    const rows = await db.select().from(affiliateFeaturePublish);
    return rows
      .map((row) => toAffiliateFeaturePublishRow(row))
      .filter((row): row is AffiliateFeaturePublishRow => row != null)
      .sort((a, b) => a.subjectKind.localeCompare(b.subjectKind) || a.subjectId - b.subjectId || a.featureKey.localeCompare(b.featureKey));
  } catch (error) {
    if (missingPublishTable(error)) return [];
    throw error;
  }
}

function editorName(user: { name?: string | null; email?: string | null }): string {
  const name = user.name?.trim();
  if (name) return name.slice(0, 255);
  const email = user.email?.trim();
  if (email) return email.slice(0, 255);
  return "Admin";
}

export async function setAffiliateFeaturePublish(
  db: Database,
  input: SetAffiliateFeaturePublishInput,
  user: { id: number; name?: string | null; email?: string | null },
): Promise<AffiliateFeaturePublishRow> {
  const updatedAt = new Date();
  const updatedByName = editorName(user);
  const values = {
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    featureKey: input.featureKey,
    published: input.published,
    updatedByUserId: user.id,
    updatedByName,
    updatedAt,
  };
  await db.insert(affiliateFeaturePublish).values(values).onDuplicateKeyUpdate({
    set: {
      published: input.published,
      updatedByUserId: user.id,
      updatedByName,
      updatedAt,
    },
  });
  const [stored] = await db
    .select()
    .from(affiliateFeaturePublish)
    .where(and(
      eq(affiliateFeaturePublish.subjectKind, input.subjectKind),
      eq(affiliateFeaturePublish.subjectId, input.subjectId),
      eq(affiliateFeaturePublish.featureKey, input.featureKey),
    ))
    .limit(1);
  const row = stored ? toAffiliateFeaturePublishRow(stored) : null;
  if (!row) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The publish switch was not saved." });
  }
  return row;
}

async function affiliateIdForSlug(db: Database, slug: string | null | undefined): Promise<number | null> {
  const normalized = slug?.trim().toLowerCase();
  if (!normalized || normalized === "owner") return null;
  const [row] = await db
    .select({ id: affiliates.id })
    .from(affiliates)
    .where(eq(affiliates.slug, normalized))
    .limit(1);
  return row?.id ?? null;
}

async function loadPublishFlags(db: Database, featureKeys: readonly string[]): Promise<PublishFlag[]> {
  if (featureKeys.length === 0) return [];
  try {
    const rows = await db
      .select({
        subjectKind: affiliateFeaturePublish.subjectKind,
        subjectId: affiliateFeaturePublish.subjectId,
        featureKey: affiliateFeaturePublish.featureKey,
        published: affiliateFeaturePublish.published,
      })
      .from(affiliateFeaturePublish)
      .where(inArray(affiliateFeaturePublish.featureKey, [...featureKeys]));
    return rows.flatMap((row) => {
      const subjectKind = asKind(row.subjectKind);
      const subjectId = Number(row.subjectId);
      if (!subjectKind || !Number.isInteger(subjectId)) return [];
      return [{
        subjectKind,
        subjectId,
        featureKey: String(row.featureKey),
        published: asBoolean(row.published),
      }];
    });
  } catch (error) {
    if (missingPublishTable(error)) return [];
    throw error;
  }
}

/**
 * Distributors the affiliate carries, plus vendors that have no distributor line.
 * No distributor selection keeps the legacy "all active lines" catalog.
 */
async function loadAffiliatePublishSubjects(db: Database, affiliateId: number): Promise<{
  carriedDistributorIds: number[];
  vendorIdsWithoutLine: number[];
}> {
  const [selections, supplierLines, vendors] = await Promise.all([
    db.select({ distributorId: affiliateDistributorSelections.distributorId })
      .from(affiliateDistributorSelections)
      .where(eq(affiliateDistributorSelections.affiliateId, affiliateId)),
    db.select({ id: distributors.id, code: distributors.code, isActive: distributors.isActive }).from(distributors),
    db.select({
      id: vendorLines.id,
      sourceKey: vendorLines.sourceKey,
      linkedDistributorIds: vendorLines.linkedDistributorIds,
    }).from(vendorLines),
  ]);
  const activeIds = supplierLines.filter((row) => row.isActive !== false).map((row) => row.id);
  const selectedIds = Array.from(new Set(selections.map((row) => row.distributorId))).filter((id) => activeIds.includes(id));
  const carriedDistributorIds = selectedIds.length > 0 ? selectedIds : activeIds;
  const vendorIdsWithoutLine = vendors
    .filter((vendor) => approvedVendorLinkedDistributorIds(vendor, supplierLines).length === 0)
    .map((vendor) => vendor.id);
  return { carriedDistributorIds, vendorIdsWithoutLine };
}

/** Distributor lines this affiliate carries that have cabinet catalog published. */
export async function publishedCabinetDistributorIds(db: Database, affiliateId: number): Promise<number[]> {
  const [subjects, rows] = await Promise.all([
    loadAffiliatePublishSubjects(db, affiliateId),
    loadPublishFlags(db, ["cabinet_catalog"]),
  ]);
  return subjects.carriedDistributorIds.filter((id) => publishFlagOn(rows, { kind: "distributor", id }, ["cabinet_catalog"]));
}

export async function guardAffiliateFeature(
  db: Database,
  args: {
    role?: string | null;
    slug?: string | null;
    affiliateId?: number | null;
    feature: AffiliateFeatureKey | readonly AffiliateFeatureKey[];
    distributorId?: number | null;
  },
): Promise<void> {
  if (args.role === "admin") return;
  const affiliateId = args.affiliateId != null
    ? args.affiliateId
    : await affiliateIdForSlug(db, args.slug);
  if (affiliateId == null) return;
  const featureKeys = (Array.isArray(args.feature) ? args.feature : [args.feature]) as readonly AffiliateFeatureKey[];
  const [subjects, rows] = await Promise.all([
    loadAffiliatePublishSubjects(db, affiliateId),
    loadPublishFlags(db, featureKeys),
  ]);
  const decision = decideAffiliateFeatureRead({
    role: args.role,
    affiliateId,
    featureKeys,
    distributorId: args.distributorId,
    carriedDistributorIds: subjects.carriedDistributorIds,
    vendorIdsWithoutLine: subjects.vendorIdsWithoutLine,
    includeVendorsWithoutLine: !(featureKeys.length === 1 && featureKeys[0] === "cabinet_catalog"),
    rows,
  });
  if (!decision.allowed) {
    throw new TRPCError({ code: "FORBIDDEN", message: AFFILIATE_FEATURE_UNPUBLISHED });
  }
}
