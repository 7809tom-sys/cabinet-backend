/**
 * Admin damage-claim review (Tom, Nov 19 2026, PR 4 part 2).
 *
 * The customer half is live: /invoice can look an order up and file a claim. This is
 * the other side - the order detail needs the claims for one order, with fresh signed
 * photo URLs, and a guarded status transition.
 *
 * Status is a closed set, and transitions are enforced HERE rather than in the UI: a
 * claim can be moved backwards only by an admin who means it, and a resolved claim
 * cannot silently reopen.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { storageGetSignedUrl } from "../storage";

export const CLAIM_STATUSES = ["submitted", "under_review", "replacement_credit", "resolved"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** Who may move where. Forward by one step, plus a deliberate reopen from resolved. */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  submitted: ["under_review", "resolved"],
  under_review: ["replacement_credit", "resolved"],
  replacement_credit: ["resolved"],
  resolved: ["under_review"],
};

const CLAIM_PHOTO_TTL_SECONDS = 600;

function rows(result: unknown): Array<Record<string, unknown>> {
  const inner = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return Array.isArray(inner) ? inner.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function iso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const adminClaimsRouter = router({
  /** Claims on one order, with items and short-lived photo URLs for the review panel. */
  listForOrder: adminProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };
      const claimRows = rows(await db.execute(sql`
        SELECT id, invoiceNumber, status, description, discoveredStage, contactEmail, submittedAt, resolutionNote
        FROM damage_claims WHERE orderId = ${input.orderId} ORDER BY submittedAt DESC
      `));
      if (claimRows.length === 0) return { claims: [] };

      const ids = claimRows.map((row) => Number(row.id));
      const itemRows = rows(await db.execute(sql`
        SELECT damageClaimId, sku, damagedQuantity, itemNotes
        FROM damage_claim_items WHERE damageClaimId IN ${sql.raw(`(${ids.join(",")})`)}
      `));
      const photoRows = rows(await db.execute(sql`
        SELECT damageClaimId, fileUrl
        FROM damage_claim_photos WHERE damageClaimId IN ${sql.raw(`(${ids.join(",")})`)}
      `));

      const itemsByClaim = new Map<number, Array<{ sku: string; damagedQuantity: number; notes: string | null }>>();
      for (const row of itemRows) {
        const claimId = Number(row.damageClaimId);
        const list = itemsByClaim.get(claimId) ?? [];
        list.push({
          sku: text(row.sku) ?? "",
          damagedQuantity: Number(row.damagedQuantity) || 0,
          notes: text(row.itemNotes),
        });
        itemsByClaim.set(claimId, list);
      }

      const photosByClaim = new Map<number, string[]>();
      for (const row of photoRows) {
        const claimId = Number(row.damageClaimId);
        const key = text(row.fileUrl);
        if (!key) continue;
        const list = photosByClaim.get(claimId) ?? [];
        try {
          list.push(await storageGetSignedUrl(key, CLAIM_PHOTO_TTL_SECONDS));
        } catch {
          // A storage hiccup must not hide the claim itself.
          continue;
        }
        photosByClaim.set(claimId, list);
      }

      return {
        claims: claimRows.map((row) => ({
          id: Number(row.id),
          invoiceNumber: text(row.invoiceNumber) ?? "",
          status: (text(row.status) ?? "submitted") as ClaimStatus,
          description: text(row.description) ?? "",
          discoveredStage: text(row.discoveredStage),
          contactEmail: text(row.contactEmail) ?? "",
          submittedAt: iso(row.submittedAt),
          resolutionNote: text(row.resolutionNote),
          items: itemsByClaim.get(Number(row.id)) ?? [],
          photos: photosByClaim.get(Number(row.id)) ?? [],
        })),
      };
    }),

  /** Move a claim along. Refuses a transition the map does not allow. */
  setStatus: adminProcedure
    .input(z.object({
      claimId: z.number().int().positive(),
      status: z.enum(CLAIM_STATUSES),
      note: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };
      const current = rows(await db.execute(sql`
        SELECT id, status FROM damage_claims WHERE id = ${input.claimId} LIMIT 1
      `))[0];
      if (!current) return { ok: false as const, message: "That claim no longer exists." };

      const from = (text(current.status) ?? "submitted") as ClaimStatus;
      if (from === input.status) return { ok: true as const, status: from };
      if (!CLAIM_TRANSITIONS[from]?.includes(input.status)) {
        return { ok: false as const, message: `A claim that is ${from} cannot become ${input.status}.` };
      }

      await db.execute(sql`
        UPDATE damage_claims
        SET status = ${input.status},
            resolutionNote = COALESCE(${input.note ?? null}, resolutionNote)
        WHERE id = ${input.claimId}
      `);
      return { ok: true as const, status: input.status };
    }),
});