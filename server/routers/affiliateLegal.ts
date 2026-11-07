import { createHash } from "node:crypto";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  affiliateLegalDocuments,
  affiliateLegalDocumentVersions,
  affiliateLegalSignatures,
  affiliateLegalSigningSessions,
} from "../../drizzle/schema";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import {
  LEGAL_DOCUMENT_FILE_PREFIX,
  LEGAL_SIGNING_CONSENT_TEXT,
  buildLegalSignerExternalId,
  canStartSigning,
  type LegalDocumentPortalEntry,
} from "@shared/affiliateLegalDocuments";
import {
  findPendingSession,
  loadAffiliateSignatures,
  loadAffiliateSessions,
  loadLegalDocumentGate,
  loadLegalDocumentsWithCurrentVersion,
} from "../lib/affiliateLegalContracts";
import {
  EsignatureNotConfiguredError,
  EsignatureProviderError,
  esignatureConfigured,
  getEsignatureProvider,
} from "../lib/docusealProvider";
import { storageFetchObject, storageGetSignedUrl, storagePut } from "../storage";
import { storageKeyFromStoredUrl } from "../lib/storageAccess";

const MAX_PDF_BYTES = 24 * 1024 * 1024;
const NOTE_NOT_CONFIGURED =
  "DocuSeal not configured. An administrator must set DOCUSEAL_API_KEY (and DOCUSEAL_WEBHOOK_SECRET) in the server environment before contracts can be signed.";

function requireDb<T>(db: T | null): T {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

/** Maps a provider error onto a tRPC error. Never leaks the key: the client redacts. */
function toTrpcProviderError(error: unknown): TRPCError {
  if (error instanceof EsignatureNotConfiguredError) {
    return new TRPCError({ code: "PRECONDITION_FAILED", message: NOTE_NOT_CONFIGURED });
  }
  if (error instanceof EsignatureProviderError) {
    return new TRPCError({
      code: "BAD_GATEWAY",
      message: `DocuSeal could not complete that request: ${error.message}`,
    });
  }
  return new TRPCError({
    code: "BAD_GATEWAY",
    message: `DocuSeal could not complete that request: ${error instanceof Error ? error.message : "unknown error"}`,
  });
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeFilename(filename: string, fallback: string): string {
  const cleaned = filename.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : fallback;
}

function slugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || `contract-${Date.now()}`;
}

/**
 * Client IP and user agent for the signature record. The provider captures the
 * authoritative pair (it sees the signer's browser); these are recorded from the
 * request that created the signing session and are labelled as such.
 */
function requestFingerprint(req: { headers?: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } } | undefined) {
  const header = req?.headers?.["x-forwarded-for"];
  const raw = Array.isArray(header) ? header[0] : header;
  const forwarded = typeof raw === "string" ? raw.split(",")[0]?.trim() : "";
  const ip = forwarded || req?.ip || req?.socket?.remoteAddress || null;
  const userAgentRaw = req?.headers?.["user-agent"];
  const userAgent = typeof userAgentRaw === "string" ? userAgentRaw.slice(0, 512) : null;
  return { ip: ip ? ip.slice(0, 64) : null, userAgent };
}

async function requireAffiliate(ctx: { user: { id: number; email: string | null; role: string } }) {
  const db = requireDb(await getDb());
  const access = await resolveAffiliateAccess(db, ctx.user);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "Affiliate access required." });
  return { db, access };
}

export const affiliateLegalRouter = router({
  // ─── Admin: documents and immutable versions ───────────────────────────────

  adminList: adminProcedure.query(async () => {
    const db = requireDb(await getDb());
    const rows = await loadLegalDocumentsWithCurrentVersion(db);
    const signatureCounts = await db
      .select({
        documentId: affiliateLegalSignatures.documentId,
        signatureId: affiliateLegalSignatures.id,
      })
      .from(affiliateLegalSignatures);
    const counts = new Map<number, number>();
    for (const row of signatureCounts) counts.set(row.documentId, (counts.get(row.documentId) ?? 0) + 1);
    return rows.map(({ document, version }) => ({
      id: document.id,
      slug: document.slug,
      title: document.title,
      summary: document.summary,
      sortOrder: document.sortOrder,
      isActive: document.isActive,
      requiredForMembership: document.requiredForMembership,
      currentVersionId: document.currentVersionId,
      currentVersion: version
        ? {
            id: version.id,
            version: version.version,
            title: version.title,
            kind: version.kind,
            contentSha256: version.contentSha256,
            docusealTemplateId: version.docusealTemplateId,
            publishedAt: version.publishedAt,
            hasFile: Boolean(version.fileKey),
            filename: version.filename,
            sizeBytes: version.sizeBytes,
          }
        : null,
      signatureCount: counts.get(document.id) ?? 0,
      signingReady: version?.docusealTemplateId != null,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }));
  }),

  adminGet: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = requireDb(await getDb());
      const [document] = await db
        .select()
        .from(affiliateLegalDocuments)
        .where(eq(affiliateLegalDocuments.id, input.id))
        .limit(1);
      if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "That document does not exist." });
      const versions = await db
        .select()
        .from(affiliateLegalDocumentVersions)
        .where(eq(affiliateLegalDocumentVersions.documentId, document.id))
        .orderBy(desc(affiliateLegalDocumentVersions.version));
      const signatures = await db
        .select()
        .from(affiliateLegalSignatures)
        .where(eq(affiliateLegalSignatures.documentId, document.id))
        .orderBy(desc(affiliateLegalSignatures.completedAt));
      return {
        document,
        // Bodies are not returned: a version is immutable evidence and the
        // admin editor only needs metadata plus the signed copies below.
        versions: versions.map((version) => ({
          id: version.id,
          version: version.version,
          title: version.title,
          kind: version.kind,
          contentSha256: version.contentSha256,
          docusealTemplateId: version.docusealTemplateId,
          publishedAt: version.publishedAt,
          filename: version.filename,
          mimeType: version.mimeType,
          sizeBytes: version.sizeBytes,
          hasFile: Boolean(version.fileKey),
          hasBody: Boolean(version.bodyMarkdown),
        })),
        signatures,
      };
    }),

  /**
   * Creates a document, or publishes the next immutable version of one.
   *
   * Publishing is the only way to change contract text: the previous version
   * row is never edited, so every signature keeps pointing at the bytes it was
   * made against. `contentSha256` is computed here, server-side, from exactly
   * what is stored.
   */
  adminSaveDocument: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        title: z.string().trim().min(1).max(255),
        slug: z.string().trim().max(80).optional(),
        summary: z.string().trim().max(512).nullable().optional(),
        sortOrder: z.number().int().min(0).max(100000).optional(),
        isActive: z.boolean().optional(),
        requiredForMembership: z.boolean().optional(),
        // A version payload. Omit to change only the document's settings.
        version: z
          .object({
            title: z.string().trim().min(1).max(255).optional(),
            bodyMarkdown: z.string().min(1).max(400_000).optional(),
            filename: z.string().trim().max(255).optional(),
            mimeType: z.string().trim().max(128).optional(),
            pdfBase64: z.string().optional(),
            // DocuSeal template id, when an admin already built one by hand.
            docusealTemplateId: z.number().int().positive().nullable().optional(),
            /** Build the DocuSeal template from the uploaded PDF in this call. */
            buildTemplate: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const versionInput = input.version;

      if (versionInput?.pdfBase64 && versionInput.bodyMarkdown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Publish a PDF or markdown text, not both." });
      }
      if (versionInput && !versionInput.pdfBase64 && !versionInput.bodyMarkdown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A new version needs contract text or a PDF." });
      }

      let documentId = input.id ?? 0;
      if (documentId) {
        const [existing] = await db
          .select()
          .from(affiliateLegalDocuments)
          .where(eq(affiliateLegalDocuments.id, documentId))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "That document does not exist." });
        await db
          .update(affiliateLegalDocuments)
          .set({
            title: input.title,
            summary: input.summary ?? existing.summary,
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            ...(input.requiredForMembership !== undefined
              ? { requiredForMembership: input.requiredForMembership }
              : {}),
          })
          .where(eq(affiliateLegalDocuments.id, documentId));
      } else {
        const slug = (input.slug?.trim() || slugFromTitle(input.title)).slice(0, 80);
        const [clash] = await db
          .select({ id: affiliateLegalDocuments.id })
          .from(affiliateLegalDocuments)
          .where(eq(affiliateLegalDocuments.slug, slug))
          .limit(1);
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A legal document with the slug "${slug}" already exists. Choose another slug.`,
          });
        }
        const inserted = await db.insert(affiliateLegalDocuments).values({
          slug,
          title: input.title,
          summary: input.summary ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          requiredForMembership: input.requiredForMembership ?? true,
          createdByUserId: ctx.user.id,
        });
        documentId = Number((inserted as unknown as [{ insertId: number }])[0]?.insertId ?? 0);
        if (!documentId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The document was not created." });
      }

      if (!versionInput) return { id: documentId, versionId: null as number | null };

      // Bytes first, hash second: the hash always describes what is stored.
      let kind: "markdown" | "pdf" = "markdown";
      let bodyMarkdown: string | null = null;
      let fileKey: string | null = null;
      let filename: string | null = null;
      let mimeType: string | null = null;
      let sizeBytes: number | null = null;
      let hashSource: Buffer;

      if (versionInput.pdfBase64) {
        const raw = versionInput.pdfBase64.includes(",")
          ? versionInput.pdfBase64.slice(versionInput.pdfBase64.indexOf(",") + 1)
          : versionInput.pdfBase64;
        const bytes = Buffer.from(raw, "base64");
        if (!bytes.length) throw new TRPCError({ code: "BAD_REQUEST", message: "The PDF upload is empty." });
        if (bytes.length > MAX_PDF_BYTES) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The PDF must be 24 MB or smaller." });
        }
        if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That file is not a PDF." });
        }
        kind = "pdf";
        filename = safeFilename(versionInput.filename ?? `${slugFromTitle(input.title)}.pdf`, "contract.pdf");
        if (!filename.toLowerCase().endsWith(".pdf")) filename = `${filename}.pdf`;
        mimeType = "application/pdf";
        sizeBytes = bytes.length;
        hashSource = bytes;
        const stored = await storagePut(
          `${LEGAL_DOCUMENT_FILE_PREFIX}${documentId}/v${Date.now()}-${filename}`,
          bytes,
          "application/pdf",
        );
        if (!stored.key.startsWith(LEGAL_DOCUMENT_FILE_PREFIX)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The contract was not stored privately." });
        }
        fileKey = stored.key;
      } else {
        bodyMarkdown = versionInput.bodyMarkdown ?? "";
        mimeType = "text/markdown";
        sizeBytes = Buffer.byteLength(bodyMarkdown, "utf8");
        hashSource = Buffer.from(bodyMarkdown, "utf8");
      }

      const contentSha256 = sha256(hashSource);

      const [latest] = await db
        .select({ version: affiliateLegalDocumentVersions.version })
        .from(affiliateLegalDocumentVersions)
        .where(eq(affiliateLegalDocumentVersions.documentId, documentId))
        .orderBy(desc(affiliateLegalDocumentVersions.version))
        .limit(1);
      const nextVersion = (latest?.version ?? 0) + 1;

      let docusealTemplateId = versionInput.docusealTemplateId ?? null;

      // Building a DocuSeal template from a PDF the admin just uploaded saves a
      // hand upload. Markdown contracts must be uploaded to DocuSeal by an admin
      // (DocuSeal renders HTML/PDF there), so they keep a manual template id.
      if (versionInput.buildTemplate) {
        if (kind !== "pdf" || !fileKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Build the DocuSeal template from a PDF version, or paste a template id for markdown.",
          });
        }
        if (!esignatureConfigured()) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: NOTE_NOT_CONFIGURED });
        }
        try {
          const pdf = await storageFetchBytesForTemplate(fileKey);
          const created = await getEsignatureProvider().createTemplateFromPdf({
            name: `${input.title} v${nextVersion}`,
            pdf,
            externalId: `cd-legal-doc-${documentId}-v${nextVersion}`,
          });
          docusealTemplateId = Number(created.templateId);
          if (!Number.isInteger(docusealTemplateId) || docusealTemplateId <= 0) {
            throw new EsignatureProviderError("DocuSeal returned an unusable template id.");
          }
        } catch (error) {
          throw toTrpcProviderError(error);
        }
      }

      const inserted = await db
        .insert(affiliateLegalDocumentVersions)
        .values({
          documentId,
          version: nextVersion,
          title: versionInput.title ?? input.title,
          kind,
          bodyMarkdown,
          fileKey,
          filename,
          mimeType,
          sizeBytes,
          contentSha256,
          docusealTemplateId,
          publishedAt: new Date(),
          createdByUserId: ctx.user.id,
        })
        .catch((error: unknown) => {
          // Two admins publishing at once: the unique key on (documentId, version)
          // rejects the loser, and that is the correct outcome.
          const message = error instanceof Error ? error.message : "";
          if (/duplicate/i.test(message)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Another admin published a version of this contract at the same moment. Reload and publish again.",
            });
          }
          throw error;
        });
      const versionId = Number((inserted as unknown as [{ insertId: number }])[0]?.insertId ?? 0);
      if (!versionId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The version was not published." });

      await db
        .update(affiliateLegalDocuments)
        .set({ currentVersionId: versionId })
        .where(eq(affiliateLegalDocuments.id, documentId));

      return { id: documentId, versionId, version: nextVersion, contentSha256, docusealTemplateId };
    }),

  /**
   * Records the DocuSeal template id for an already-published version. The only
   * edit a published version accepts, because it adds a provider reference and
   * changes no contract text.
   */
  adminSetTemplate: adminProcedure
    .input(z.object({ versionId: z.number().int().positive(), docusealTemplateId: z.number().int().positive().nullable() }))
    .mutation(async ({ input }) => {
      const db = requireDb(await getDb());
      const [version] = await db
        .select({ id: affiliateLegalDocumentVersions.id })
        .from(affiliateLegalDocumentVersions)
        .where(eq(affiliateLegalDocumentVersions.id, input.versionId))
        .limit(1);
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "That version does not exist." });
      await db
        .update(affiliateLegalDocumentVersions)
        .set({ docusealTemplateId: input.docusealTemplateId })
        .where(eq(affiliateLegalDocumentVersions.id, input.versionId));
      return { versionId: input.versionId, docusealTemplateId: input.docusealTemplateId };
    }),

  /** Deactivating keeps every signature and every version; nothing is deleted. */
  adminSetActive: adminProcedure
    .input(z.object({ id: z.number().int().positive(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = requireDb(await getDb());
      await db
        .update(affiliateLegalDocuments)
        .set({ isActive: input.isActive })
        .where(eq(affiliateLegalDocuments.id, input.id));
      return { id: input.id, isActive: input.isActive };
    }),

  /** Signed copy or audit trail for one signature. Affiliate owner or any admin. */
  signedCopyLink: protectedProcedure
    .input(z.object({ signatureId: z.number().int().positive(), kind: z.enum(["signed", "audit"]).default("signed") }))
    .query(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const [signature] = await db
        .select()
        .from(affiliateLegalSignatures)
        .where(eq(affiliateLegalSignatures.id, input.signatureId))
        .limit(1);
      if (!signature) throw new TRPCError({ code: "NOT_FOUND", message: "That signature does not exist." });
      if (ctx.user.role !== "admin") {
        const access = await resolveAffiliateAccess(db, ctx.user);
        if (!access || access.affiliateId !== signature.affiliateId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "That signed contract belongs to another affiliate." });
        }
      }
      const key = input.kind === "audit" ? signature.auditLogKey : signature.signedPdfKey;
      if (!key) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No stored copy exists for that signature yet." });
      }
      const url = await storageGetSignedUrl(storageKeyFromStoredUrl(key), 900);
      return { url, expiresInSeconds: 900, filename: input.kind === "audit" ? "audit-log.pdf" : "signed-contract.pdf" };
    }),

  // ─── Affiliate: what must be signed, and its status ────────────────────────

  myRequiredDocuments: protectedProcedure.query(async ({ ctx }) => {
    const { db, access } = await requireAffiliate(ctx);
    const gate = await loadLegalDocumentGate(db, access.affiliateId);
    const documents = await loadLegalDocumentsWithCurrentVersion(db, { activeOnly: true });
    const signatures = await loadAffiliateSignatures(db, access.affiliateId);
    const sessions = await loadAffiliateSessions(db, access.affiliateId);

    const byVersion = new Map(signatures.map((row) => [row.documentVersionId, row]));
    // Versions with a pending provider request, so the portal can offer Resume
    // instead of Start on exactly those documents.
    const inProgressVersionIds = Array.from(
      new Set(sessions.filter((row) => row.status === "pending").map((row) => row.documentVersionId)),
    );

    const entries: LegalDocumentPortalEntry[] = documents.map(({ document, version }) => {
      const gateEntry = gate.documents.find((entry) => entry.documentId === document.id);
      const signature = version ? byVersion.get(version.id) ?? null : null;
      return {
        documentId: document.id,
        slug: document.slug,
        title: document.title,
        required: gateEntry?.required ?? false,
        currentVersionId: version?.id ?? null,
        currentVersionNumber: version?.version ?? null,
        status: gateEntry?.status ?? "not_required",
        signedAt: gateEntry?.signedAt ?? null,
        summary: document.summary,
        kind: version?.kind ?? null,
        versionTitle: version?.title ?? null,
        signatureId: signature?.id ?? null,
        signingReady: version?.docusealTemplateId != null && !signature,
      };
    });

    return {
      signedAll: gate.signedAll,
      pendingCount: gate.pending.length + gate.unpublished.length,
      consentText: LEGAL_SIGNING_CONSENT_TEXT,
      documents: entries,
      /** True when the server can actually start a signing request right now. */
      providerConfigured: esignatureConfigured(),
      inProgressVersionIds,
    };
  }),

  /** Signed copies for the signed-in affiliate, newest first. */
  mySignatures: protectedProcedure.query(async ({ ctx }) => {
    const { db, access } = await requireAffiliate(ctx);
    const rows = await loadAffiliateSignatures(db, access.affiliateId);
    return rows.map((row) => ({
      id: row.id,
      documentSlug: row.documentSlug,
      documentTitle: row.documentTitle,
      documentVersion: row.documentVersion,
      contentSha256: row.contentSha256,
      signerName: row.signerName,
      completedAt: row.completedAt,
      hasSignedCopy: Boolean(row.signedPdfKey),
      hasAuditLog: Boolean(row.auditLogKey),
    }));
  }),

  /**
   * Starts (or resumes) signing one contract.
   *
   * Consent is explicit: the caller must send `consent: true`, which is the
   * checkbox in the portal. The affiliate's typed legal name fills the DocuSeal
   * signer. DocuSeal owns the signature, the timestamp, and the audit trail; we
   * store only its references plus our own request fingerprint.
   */
  startSigning: protectedProcedure
    .input(
      z.object({
        documentId: z.number().int().positive(),
        consent: z.literal(true),
        typedLegalName: z.string().trim().min(2).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, access } = await requireAffiliate(ctx);
      if (!esignatureConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: NOTE_NOT_CONFIGURED });
      }

      const [document] = await db
        .select()
        .from(affiliateLegalDocuments)
        .where(eq(affiliateLegalDocuments.id, input.documentId))
        .limit(1);
      if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "That document does not exist." });

      const [version] = document.currentVersionId
        ? await db
            .select()
            .from(affiliateLegalDocumentVersions)
            .where(eq(affiliateLegalDocumentVersions.id, document.currentVersionId))
            .limit(1)
        : [];

      const [alreadySigned] = version
        ? await db
            .select({ id: affiliateLegalSignatures.id })
            .from(affiliateLegalSignatures)
            .where(
              and(
                eq(affiliateLegalSignatures.affiliateId, access.affiliateId),
                eq(affiliateLegalSignatures.documentVersionId, version.id),
              ),
            )
            .limit(1)
        : [];

      const readiness = canStartSigning({
        isActive: document.isActive,
        requiredForMembership: document.requiredForMembership,
        currentVersionId: version?.id ?? null,
        alreadySigned: Boolean(alreadySigned),
        templateId: version?.docusealTemplateId ?? null,
      });
      if (!readiness.ok) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: readiness.reason });
      }

      const activeVersion = version!;
      const fingerprint = requestFingerprint(ctx.req as never);
      const signerEmail = (ctx.user.email ?? "").trim();

      // Resume an open request rather than opening a second one for the same
      // contract: DocuSeal would otherwise accumulate duplicate submissions for
      // one affiliate and one version.
      const pending = await findPendingSession(db, access.affiliateId, activeVersion.id);
      if (pending?.providerSubmissionId) {
        try {
          const resumed = await getEsignatureProvider().resumeSigningRequest({
            submissionId: pending.providerSubmissionId,
            submitterId: pending.providerSubmitterId,
          });
          if (resumed) {
            return {
              sessionId: pending.id,
              submissionId: pending.providerSubmissionId,
              submitterId: pending.providerSubmitterId,
              embedSrc: resumed.embedSrc,
              resume: true,
              consentText: LEGAL_SIGNING_CONSENT_TEXT,
              signerEmail,
              requestIp: fingerprint.ip,
            };
          }
        } catch (error) {
          // A provider hiccup while resuming must not block a fresh request:
          // fall through and create a new one, leaving the old session pending.
          console.error(
            "[Affiliate legal] Could not resume the open signing request:",
            error instanceof Error ? error.message : "unknown error",
          );
        }
      }

      if (!signerEmail) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Your account has no email address. Add one before signing a contract.",
        });
      }

      const externalId = buildLegalSignerExternalId({
        affiliateId: access.affiliateId,
        documentVersionId: activeVersion.id,
      });
      let created: { submissionId: string; submitterId: string | null; embedSrc: string; status: string };
      try {
        created = await getEsignatureProvider().createSigningRequest({
          templateId: activeVersion.docusealTemplateId!,
          signer: { name: input.typedLegalName, email: signerEmail, externalId },
          metadata: {
            affiliateId: String(access.affiliateId),
            documentId: String(document.id),
            documentVersionId: String(activeVersion.id),
            documentSlug: document.slug,
          },
        });
      } catch (error) {
        throw toTrpcProviderError(error);
      }

      const inserted = await db.insert(affiliateLegalSigningSessions).values({
        affiliateId: access.affiliateId,
        documentId: document.id,
        documentVersionId: activeVersion.id,
        provider: "docuseal",
        providerSubmissionId: created.submissionId,
        providerSubmitterId: created.submitterId,
        status: "pending",
        createdByUserId: ctx.user.id,
      });
      const sessionId = Number((inserted as unknown as [{ insertId: number }])[0]?.insertId ?? 0);

      return {
        sessionId,
        submissionId: created.submissionId,
        submitterId: created.submitterId,
        embedSrc: created.embedSrc,
        resume: false,
        consentText: LEGAL_SIGNING_CONSENT_TEXT,
        signerEmail,
        requestIp: fingerprint.ip,
      };
    }),

  /** The onboarding gate, for the affiliate dashboard to show a locked state. */
  myGate: protectedProcedure.query(async ({ ctx }) => {
    const { db, access } = await requireAffiliate(ctx);
    const gate = await loadLegalDocumentGate(db, access.affiliateId);
    return { signedAll: gate.signedAll, pending: gate.pending, unpublished: gate.unpublished };
  }),

  /** Admin view of one affiliate's contracts and signatures. */
  adminAffiliateGate: adminProcedure
    .input(z.object({ affiliateId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = requireDb(await getDb());
      const gate = await loadLegalDocumentGate(db, input.affiliateId);
      const signatures = await loadAffiliateSignatures(db, input.affiliateId);
      // Same value hasSignedAllRequired returns, read from the gate already loaded.
      return { ...gate, signatures, signedAllRequired: gate.signedAll };
    }),
});

/**
 * Reads an already-stored contract PDF for template creation. Kept out of the
 * procedure body so the tRPC input never has to carry the bytes twice.
 */
async function storageFetchBytesForTemplate(key: string): Promise<Buffer> {
  const response = await storageFetchObject(key);
  if (!response.ok) {
    throw new EsignatureProviderError(`The stored contract could not be read (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}
