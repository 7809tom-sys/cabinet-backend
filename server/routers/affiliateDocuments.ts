import { z } from "zod";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { PRIVATE_BUCKET, storageDeleteFromBucket, storageGetSignedUrl, storagePut } from "../storage";
import { affiliateDocuments, affiliates } from "../../drizzle/schema";
import {
  affiliateDocumentMimeMatches,
  affiliateDocumentView,
  decodeAffiliateDocumentUpload,
  displayNameFor,
  loadCurrentAffiliateDocuments,
  sniffAffiliateDocumentMime,
} from "../lib/affiliateDocuments";
import {
  AFFILIATE_DOCUMENT_FILE_PREFIX,
  AFFILIATE_DOCUMENT_HINTS,
  AFFILIATE_DOCUMENT_LABELS,
  AFFILIATE_DOCUMENT_TYPES,
  OPTIONAL_AFFILIATE_DOCUMENT_TYPES,
  REQUIRED_AFFILIATE_DOCUMENT_TYPES,
  affiliateDocumentExtension,
  affiliateDocumentGateStatus,
  affiliateDocumentLabel,
  hasRequiredAffiliateDocuments,
  isAffiliateDocumentMimeType,
  isAffiliateDocumentType,
  requiredAffiliateDocumentState,
  type AffiliateDocumentType,
} from "@shared/affiliateDocuments";

/** Five minutes: long enough to open the file, short enough to be worthless if forwarded. */
const DOCUMENT_LINK_SECONDS = 300;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type User = { id: number; email: string | null; role: string };

function requireDb(db: Database | null): Database {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

/**
 * Onboarding documents belong to the store owner, not to a team member. A team
 * member with CRM access must not be able to read the owner's license or SSN
 * card, so this is the same ownership rule the W-9 procedures use.
 */
async function requireOwnedAffiliate(db: Database, user: User) {
  const access = await resolveAffiliateAccess(db, { id: user.id, email: user.email });
  if (!access?.isOwner) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the affiliate owner can manage onboarding documents." });
  }
  const [row] = await db.select().from(affiliates).where(eq(affiliates.id, access.affiliateId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate account not found." });
  return row;
}

/**
 * The storage key is derived from the affiliate id, the document type, a
 * timestamp, and the type's own extension. The affiliate's filename is never
 * part of it, so a key can never leak a name.
 */
function documentStorageKey(affiliateId: number, docType: AffiliateDocumentType, extension: string): string {
  return `${AFFILIATE_DOCUMENT_FILE_PREFIX}${affiliateId}/${docType}-${Date.now()}.${extension}`;
}

function statusSummary(rows: Array<{ docType: string; status: string; supersededAt: Date | null }>) {
  return AFFILIATE_DOCUMENT_TYPES.map((docType) => ({
    docType,
    label: AFFILIATE_DOCUMENT_LABELS[docType],
    hint: AFFILIATE_DOCUMENT_HINTS[docType],
    required: (REQUIRED_AFFILIATE_DOCUMENT_TYPES as readonly string[]).includes(docType),
    status: affiliateDocumentGateStatus(rows, docType),
  }));
}

export const affiliateDocumentsRouter = router({
  /**
   * The affiliate's own onboarding status: every required document, whether it
   * is missing, pending, approved, or rejected, and the gate result. No storage
   * key and no URL is returned, so this payload is safe to render.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb(await getDb());
    const mine = await requireOwnedAffiliate(db, ctx.user);
    const rows = await loadCurrentAffiliateDocuments(db, mine.id);
    const requiredDocuments = requiredAffiliateDocumentState(rows);
    return {
      affiliateId: mine.id,
      hasRequiredDocuments: hasRequiredAffiliateDocuments(rows),
      requiredDocuments,
      missingDocumentTypes: requiredDocuments
        .filter((document) => document.status !== "approved")
        .map((document) => document.docType),
      documents: statusSummary(rows),
      uploads: rows.map((row) => affiliateDocumentView(row)),
    };
  }),

  /**
   * Upload (or replace) one onboarding document. A replacement keeps history:
   * the previous upload keeps its status and review audit and is retired with
   * supersededAt + supersededByDocumentId pointing at the new row. The new row
   * always starts pending, so a replace always needs a fresh review.
   */
  upload: protectedProcedure
    .input(z.object({
      docType: z.string().refine(isAffiliateDocumentType, {
        message: `Choose one of: ${AFFILIATE_DOCUMENT_TYPES.join(", ")}.`,
      }),
      mimeType: z.string().refine(isAffiliateDocumentMimeType, {
        message: "Upload a JPG, PNG, HEIC, or PDF file.",
      }),
      fileBase64: z.string().min(1),
      fileName: z.string().max(256).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const mine = await requireOwnedAffiliate(db, ctx.user);
      const docType = input.docType as AffiliateDocumentType;

      const bytes = decodeAffiliateDocumentUpload(input.fileBase64);
      const detected = sniffAffiliateDocumentMime(bytes);
      if (!affiliateDocumentMimeMatches(input.mimeType, detected)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `This file is not a ${affiliateDocumentLabel(docType).toLowerCase()}-compatible JPG, PNG, HEIC, or PDF.`,
        });
      }
      const extension = affiliateDocumentExtension(input.mimeType);
      if (!extension) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a JPG, PNG, HEIC, or PDF file." });
      }

      // storagePut keeps the key in the private bucket (affiliate-documents/ is
      // a private prefix). Only the key is saved; the returned url is discarded.
      const stored = await storagePut(documentStorageKey(mine.id, docType, extension), bytes, input.mimeType);

      let documentId: number;
      try {
        documentId = await db.transaction(async (tx) => {
          const [inserted] = await tx.insert(affiliateDocuments).values({
            affiliateId: mine.id,
            docType,
            storageKey: stored.key,
            mimeType: input.mimeType,
            sizeBytes: bytes.length,
            originalName: displayNameFor(input.fileName),
            status: "pending",
            uploadedBy: ctx.user.id,
          });
          const id = Number((inserted as unknown as { insertId: number }).insertId);
          if (!Number.isFinite(id) || id <= 0) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The document could not be saved." });
          }
          await tx.update(affiliateDocuments)
            .set({ supersededAt: new Date(), supersededByDocumentId: id })
            .where(and(
              eq(affiliateDocuments.affiliateId, mine.id),
              eq(affiliateDocuments.docType, docType),
              isNull(affiliateDocuments.supersededAt),
              // The insert above is current too; superseding it would retire the
              // upload the affiliate just made.
              ne(affiliateDocuments.id, id),
            ));
          return id;
        });
      } catch (error) {
        // No row points at this object, so drop it rather than leave an
        // unreachable copy of someone's license in the bucket.
        await storageDeleteFromBucket(PRIVATE_BUCKET, stored.key).catch(() => undefined);
        throw error;
      }

      const rows = await loadCurrentAffiliateDocuments(db, mine.id);
      const [saved] = rows.filter((row) => row.id === documentId);
      return {
        ok: true as const,
        document: saved ? affiliateDocumentView(saved) : null,
        hasRequiredDocuments: hasRequiredAffiliateDocuments(rows),
      };
    }),

  /**
   * A short-lived signed link to one of the affiliate's own current uploads.
   * Owner-checked against the row, never against a client-supplied key.
   */
  link: protectedProcedure
    .input(z.object({ documentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const mine = await requireOwnedAffiliate(db, ctx.user);
      const [row] = await db.select().from(affiliateDocuments)
        .where(and(
          eq(affiliateDocuments.id, input.documentId),
          eq(affiliateDocuments.affiliateId, mine.id),
          isNull(affiliateDocuments.supersededAt),
        ))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      const url = await storageGetSignedUrl(row.storageKey, DOCUMENT_LINK_SECONDS);
      return { url, expiresInSeconds: DOCUMENT_LINK_SECONDS, docType: row.docType, mimeType: row.mimeType };
    }),

  /**
   * Admin review queue. Without an affiliateId it lists every pending upload
   * across stores; with one it lists that store's current uploads in full.
   */
  adminList: adminProcedure
    .input(z.object({
      affiliateId: z.number().int().positive().optional(),
      status: z.enum(["pending", "approved", "rejected"]).optional(),
      includeSuperseded: z.boolean().default(false),
      limit: z.number().int().min(1).max(200).default(100),
    }).optional())
    .query(async ({ input }) => {
      const db = requireDb(await getDb());
      const args = input ?? { includeSuperseded: false, limit: 100 };
      const conditions = [];
      if (args.affiliateId) conditions.push(eq(affiliateDocuments.affiliateId, args.affiliateId));
      if (args.status) conditions.push(eq(affiliateDocuments.status, args.status));
      else if (!args.affiliateId) conditions.push(eq(affiliateDocuments.status, "pending"));
      if (!args.includeSuperseded) conditions.push(isNull(affiliateDocuments.supersededAt));

      const rows = await db
        .select({
          id: affiliateDocuments.id,
          affiliateId: affiliateDocuments.affiliateId,
          docType: affiliateDocuments.docType,
          status: affiliateDocuments.status,
          mimeType: affiliateDocuments.mimeType,
          sizeBytes: affiliateDocuments.sizeBytes,
          originalName: affiliateDocuments.originalName,
          note: affiliateDocuments.note,
          createdAt: affiliateDocuments.createdAt,
          reviewedAt: affiliateDocuments.reviewedAt,
          supersededAt: affiliateDocuments.supersededAt,
          storeName: affiliates.storeName,
          slug: affiliates.slug,
          affiliateEmail: affiliates.email,
        })
        .from(affiliateDocuments)
        .leftJoin(affiliates, eq(affiliates.id, affiliateDocuments.affiliateId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(affiliateDocuments.createdAt))
        .limit(args.limit);

      const documents = rows.map(({ storeName, slug, affiliateEmail, ...document }) => ({
        ...affiliateDocumentView(document),
        affiliateId: document.affiliateId,
        storeName,
        slug,
        affiliateEmail,
      }));

      let gate: { hasRequiredDocuments: boolean; documents: ReturnType<typeof requiredAffiliateDocumentState> } | null = null;
      if (args.affiliateId) {
        const current = await loadCurrentAffiliateDocuments(db, args.affiliateId);
        gate = {
          hasRequiredDocuments: hasRequiredAffiliateDocuments(current),
          documents: requiredAffiliateDocumentState(current),
        };
      }
      return {
        documents,
        pendingCount: documents.filter((document) => document.status === "pending").length,
        gate,
      };
    }),

  /**
   * A short-lived signed link for one document, for review staff. The key comes
   * from the row, never from the request, and a superseded upload is still
   * readable so a reviewer can compare a replacement with what it replaced.
   */
  adminLink: adminProcedure
    .input(z.object({ documentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = requireDb(await getDb());
      const [row] = await db.select().from(affiliateDocuments)
        .where(eq(affiliateDocuments.id, input.documentId))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      const url = await storageGetSignedUrl(row.storageKey, DOCUMENT_LINK_SECONDS);
      return {
        url,
        expiresInSeconds: DOCUMENT_LINK_SECONDS,
        affiliateId: row.affiliateId,
        docType: row.docType,
        docTypeLabel: affiliateDocumentLabel(row.docType),
        mimeType: row.mimeType,
        status: row.status,
        note: row.note,
        superseded: row.supersededAt != null,
      };
    }),

  /** Approve or reject one current upload. A superseded upload is history and is not reviewable. */
  adminReview: adminProcedure
    .input(z.object({
      documentId: z.number().int().positive(),
      action: z.enum(["approve", "reject"]),
      note: z.string().trim().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [row] = await db.select().from(affiliateDocuments)
        .where(eq(affiliateDocuments.id, input.documentId))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      if (row.supersededAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This upload has been replaced. Review the current document instead." });
      }
      await db.update(affiliateDocuments).set({
        status: input.action === "approve" ? "approved" : "rejected",
        reviewedAt: new Date(),
        reviewedBy: ctx.user.id,
        note: input.note?.trim() ? input.note.trim() : null,
      }).where(eq(affiliateDocuments.id, row.id));

      const current = await loadCurrentAffiliateDocuments(db, row.affiliateId);
      return {
        ok: true as const,
        documentId: row.id,
        status: input.action === "approve" ? "approved" as const : "rejected" as const,
        affiliateId: row.affiliateId,
        hasRequiredDocuments: hasRequiredAffiliateDocuments(current),
        requiredDocuments: requiredAffiliateDocumentState(current),
      };
    }),

  /** Admin read of one store's gate, for the affiliate detail panel. */
  adminGate: adminProcedure
    .input(z.object({ affiliateId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = requireDb(await getDb());
      const [affiliate] = await db.select({ id: affiliates.id, storeName: affiliates.storeName })
        .from(affiliates)
        .where(eq(affiliates.id, input.affiliateId))
        .limit(1);
      if (!affiliate) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });
      const current = await loadCurrentAffiliateDocuments(db, affiliate.id);
      return {
        affiliateId: affiliate.id,
        storeName: affiliate.storeName,
        hasRequiredDocuments: hasRequiredAffiliateDocuments(current),
        requiredDocuments: requiredAffiliateDocumentState(current),
        optionalDocumentTypes: OPTIONAL_AFFILIATE_DOCUMENT_TYPES,
      };
    }),

  /** Count of stores waiting on a document review, for the admin nav badge. */
  adminPendingCount: adminProcedure.query(async () => {
    const db = requireDb(await getDb());
    const [row] = await db
      .select({ pending: sql<number>`count(*)` })
      .from(affiliateDocuments)
      .where(and(
        eq(affiliateDocuments.status, "pending"),
        isNull(affiliateDocuments.supersededAt),
      ));
    return { pending: Number(row?.pending ?? 0) };
  }),
});
