import { eq, inArray } from "drizzle-orm";
import {
  affiliateHardwareCommissionSnapshots,
  affiliateInstallationEstimates,
  affiliateTeamMembers,
  affiliates,
  aiServiceRequests,
  cartItems,
  carts,
  codeAliases,
  countertopQuotes,
  crmActivities,
  crmCleanupAudit,
  crmCleanupBackupRows,
  crmDealDesigns,
  crmDeals,
  crmEmailLog,
  crmEvents,
  customerFavorites,
  customerFavoriteSyncs,
  customerPreferredProducts,
  designConsultations,
  designGeminiImageTestJobs,
  designImageRequests,
  designLayoutInstances,
  designLayoutZoneSelections,
  designLeads,
  designPhotoRenders,
  designViewLog,
  designerAvailability,
  kitchenDesigns,
  measureSessions,
  orderItems,
  orderRequests,
  orderShipments,
  orders,
  passwordResetTokens,
  payments,
  salesCommissions,
  stripePaymentRecords,
  subscribers,
  surfacePreviews,
  threeDRoomShares,
  users,
} from "../../drizzle/schema";
import { redactRow } from "./redact";
import type { CanonicalSnapshot } from "./snapshot";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;
type QueryDb = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

const BATCH = 100;

const DELETE_ORDER = [
  "design_layout_zone_selections",
  "design_layout_instances",
  "three_d_room_shares",
  "cart_items",
  "design_view_log",
  "crm_deal_designs",
  "crm_activities",
  "crm_email_log",
  "sales_commissions",
  "payments",
  "order_shipments",
  "affiliate_hardware_commission_snapshots",
  "stripe_payment_records",
  "affiliate_installation_estimates",
  "design_image_requests",
  "design_photo_renders",
  "design_gemini_image_test_jobs",
  "design_consultations",
  "designer_availability",
  "customer_favorites",
  "customer_favorite_syncs",
  "customer_preferred_products",
  "password_reset_tokens",
  "code_aliases",
  "measure_sessions",
  "crm_events",
  "design_leads",
  "countertop_quotes",
  "ai_service_requests",
  "affiliate_team_members",
  "subscribers",
  "surface_previews",
  "order_items",
  "carts",
  "order_requests",
  "orders",
  "crm_deals",
  "kitchen_designs",
  "users",
] as const;

// Drizzle's table generics differ per table; the cleanup only needs id select/delete.
const TABLES: Record<string, { table: any; id: any }> = {
  design_layout_zone_selections: { table: designLayoutZoneSelections, id: designLayoutZoneSelections.id },
  design_layout_instances: { table: designLayoutInstances, id: designLayoutInstances.id },
  three_d_room_shares: { table: threeDRoomShares, id: threeDRoomShares.id },
  cart_items: { table: cartItems, id: cartItems.id },
  design_view_log: { table: designViewLog, id: designViewLog.id },
  crm_deal_designs: { table: crmDealDesigns, id: crmDealDesigns.id },
  crm_activities: { table: crmActivities, id: crmActivities.id },
  crm_email_log: { table: crmEmailLog, id: crmEmailLog.id },
  sales_commissions: { table: salesCommissions, id: salesCommissions.id },
  payments: { table: payments, id: payments.id },
  order_shipments: { table: orderShipments, id: orderShipments.id },
  affiliate_hardware_commission_snapshots: { table: affiliateHardwareCommissionSnapshots, id: affiliateHardwareCommissionSnapshots.id },
  stripe_payment_records: { table: stripePaymentRecords, id: stripePaymentRecords.id },
  affiliate_installation_estimates: { table: affiliateInstallationEstimates, id: affiliateInstallationEstimates.id },
  design_image_requests: { table: designImageRequests, id: designImageRequests.id },
  design_photo_renders: { table: designPhotoRenders, id: designPhotoRenders.id },
  design_gemini_image_test_jobs: { table: designGeminiImageTestJobs, id: designGeminiImageTestJobs.id },
  design_consultations: { table: designConsultations, id: designConsultations.id },
  designer_availability: { table: designerAvailability, id: designerAvailability.id },
  customer_favorites: { table: customerFavorites, id: customerFavorites.id },
  customer_favorite_syncs: { table: customerFavoriteSyncs, id: customerFavoriteSyncs.id },
  customer_preferred_products: { table: customerPreferredProducts, id: customerPreferredProducts.id },
  password_reset_tokens: { table: passwordResetTokens, id: passwordResetTokens.id },
  code_aliases: { table: codeAliases, id: codeAliases.id },
  measure_sessions: { table: measureSessions, id: measureSessions.id },
  crm_events: { table: crmEvents, id: crmEvents.id },
  design_leads: { table: designLeads, id: designLeads.id },
  countertop_quotes: { table: countertopQuotes, id: countertopQuotes.id },
  ai_service_requests: { table: aiServiceRequests, id: aiServiceRequests.id },
  affiliate_team_members: { table: affiliateTeamMembers, id: affiliateTeamMembers.id },
  subscribers: { table: subscribers, id: subscribers.id },
  surface_previews: { table: surfacePreviews, id: surfacePreviews.id },
  order_items: { table: orderItems, id: orderItems.id },
  carts: { table: carts, id: carts.id },
  order_requests: { table: orderRequests, id: orderRequests.id },
  orders: { table: orders, id: orders.id },
  crm_deals: { table: crmDeals, id: crmDeals.id },
  kitchen_designs: { table: kitchenDesigns, id: kitchenDesigns.id },
  users: { table: users, id: users.id },
  affiliates: { table: affiliates, id: affiliates.id },
};

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function idsFor(snapshot: CanonicalSnapshot, table: string): number[] {
  const ids = new Set<number>();
  const take = (rows: { id: number }[]) => {
    for (const row of rows) ids.add(row.id);
  };
  if (table === "users") take(snapshot.deleteUsers);
  if (table === "order_requests") take(snapshot.deleteOrders);
  if (table === "orders") take(snapshot.deleteLegacyOrders);
  if (table === "crm_deals") take(snapshot.deleteDeals);
  if (table === "stripe_payment_records") take(snapshot.deleteStripe);
  if (table === "affiliate_installation_estimates") take(snapshot.deleteEstimates);
  for (const row of snapshot.deleteChildren) {
    if (row.table === table) ids.add(row.id);
  }
  return Array.from(ids);
}

async function backupAndDelete(db: Database, auditId: number, tableName: string, ids: number[]): Promise<number> {
  const spec = TABLES[tableName];
  if (!spec) throw new Error(`CRM cleanup has no delete mapping for ${tableName}.`);
  let deleted = 0;
  for (const chunk of chunks(ids, BATCH)) {
    if (chunk.length === 0) continue;
    await db.transaction(async (tx) => {
      const rows = await tx.select().from(spec.table).where(inArray(spec.id, chunk));
      if (rows.length === 0) return;
      await tx.insert(crmCleanupBackupRows).values(
        rows.map((row) => ({
          auditId,
          tableName,
          rowPk: Number(row.id),
          rowJson: redactRow(row as Record<string, unknown>),
        })),
      );
      await tx.delete(spec.table).where(inArray(spec.id, rows.map((row) => Number(row.id))));
      deleted += rows.length;
    });
  }
  return deleted;
}

async function backupRows(tx: QueryDb, auditId: number, tableName: string, rows: { id: number }[]) {
  if (rows.length === 0) return;
  await tx.insert(crmCleanupBackupRows).values(
    rows.map((row) => ({
      auditId,
      tableName,
      rowPk: Number(row.id),
      rowJson: redactRow(row as unknown as Record<string, unknown>),
    })),
  );
}

async function applyUnlinks(db: Database, auditId: number, snapshot: CanonicalSnapshot): Promise<number> {
  const groups = new Map<string, number[]>();
  for (const unlink of snapshot.unlinks) {
    const key = `${unlink.table}:${unlink.field}`;
    const list = groups.get(key) ?? [];
    list.push(unlink.id);
    groups.set(key, list);
  }
  let updated = 0;
  for (const [key, ids] of Array.from(groups.entries())) {
    const [tableName, field] = key.split(":");
    const spec = TABLES[tableName];
    if (!spec) throw new Error(`CRM cleanup has no unlink mapping for ${tableName}.`);
    for (const chunk of chunks(ids, BATCH)) {
      await db.transaction(async (tx) => {
        const rows = await tx.select().from(spec.table).where(inArray(spec.id, chunk));
        await backupRows(tx, auditId, tableName!, rows as { id: number }[]);
        if (tableName === "affiliates" && field === "userId") {
          await tx.update(affiliates).set({ userId: null }).where(inArray(affiliates.id, chunk));
        } else if (tableName === "code_aliases" && field === "createdByUserId") {
          await tx.update(codeAliases).set({ createdByUserId: null }).where(inArray(codeAliases.id, chunk));
        } else if (tableName === "crm_deals" && field === "ownerUserId") {
          await tx.update(crmDeals).set({ ownerUserId: null }).where(inArray(crmDeals.id, chunk));
        } else if (tableName === "affiliate_installation_estimates" && field === "orderRequestId") {
          await tx.update(affiliateInstallationEstimates).set({ orderRequestId: null }).where(inArray(affiliateInstallationEstimates.id, chunk));
        } else {
          throw new Error(`CRM cleanup cannot unlink ${tableName}.${field}.`);
        }
        updated += rows.length;
      });
    }
  }
  return updated;
}

export async function assertAdminsSurvive(db: Database, snapshot: CanonicalSnapshot, actorUserId: number): Promise<void> {
  if (snapshot.deleteUsers.some((user) => user.id === actorUserId)) {
    throw new Error("Refusing to delete the signed-in admin.");
  }
  const adminRows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  const deleting = new Set(snapshot.deleteUsers.map((user) => user.id));
  const survivors = adminRows.filter((row) => !deleting.has(row.id));
  if (adminRows.length > 0 && survivors.length === 0) {
    throw new Error("Refusing to delete the last admin.");
  }
}

export async function executeCleanup(
  db: Database,
  args: {
    previewId: number;
    actorUserId: number;
    actorName: string | null;
    actorEmail: string | null;
    snapshot: CanonicalSnapshot;
  },
): Promise<{ auditId: number; deletedByTable: Record<string, number>; unlinked: number }> {
  await assertAdminsSurvive(db, args.snapshot, args.actorUserId);
  for (const row of args.snapshot.deleteChildren) {
    if (!DELETE_ORDER.includes(row.table as (typeof DELETE_ORDER)[number])) {
      throw new Error(`CRM cleanup has no delete order for ${row.table}.`);
    }
  }
  const [inserted] = await db.insert(crmCleanupAudit).values({
    previewId: args.previewId,
    actorUserId: args.actorUserId,
    actorName: args.actorName,
    actorEmail: args.actorEmail,
    status: "running",
    keepUserIdsJson: args.snapshot.keepUserIds,
    countsJson: null,
    supabaseOptIn: args.snapshot.deleteSupabaseAuth,
  });
  const auditId = Number(inserted.insertId);
  const deletedByTable: Record<string, number> = {};
  try {
    for (const tableName of DELETE_ORDER) {
      if (tableName === "users") {
        await assertAdminsSurvive(db, args.snapshot, args.actorUserId);
        await applyUnlinks(db, auditId, args.snapshot);
      }
      const ids = idsFor(args.snapshot, tableName);
      if (ids.length === 0) continue;
      deletedByTable[tableName] = await backupAndDelete(db, auditId, tableName, ids);
    }
    return { auditId, deletedByTable, unlinked: args.snapshot.unlinks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "CRM cleanup failed";
    await db.update(crmCleanupAudit).set({ status: "failed", errorMessage: message.slice(0, 2000), finishedAt: new Date() }).where(eq(crmCleanupAudit.id, auditId));
    throw error;
  }
}

export async function finishCleanupAudit(
  db: Database,
  auditId: number,
  counts: Record<string, unknown>,
  supabase: { deleted: number; failed: number },
): Promise<void> {
  await db
    .update(crmCleanupAudit)
    .set({
      status: "completed",
      countsJson: counts,
      supabaseDeleted: supabase.deleted,
      supabaseFailed: supabase.failed,
      finishedAt: new Date(),
    })
    .where(eq(crmCleanupAudit.id, auditId));
}
