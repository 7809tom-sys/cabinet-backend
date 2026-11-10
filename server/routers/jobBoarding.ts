import { createHash } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { storageGetSignedUrl, storagePut } from "../storage";
import { decryptW9TaxId, encryptW9TaxId } from "../lib/w9TaxIdCrypto";
import {
  affiliateDocumentMimeMatches,
  decodeAffiliateDocumentUpload,
  displayNameFor,
  sniffAffiliateDocumentMime,
} from "../lib/affiliateDocuments";
import {
  ensureNonCompetePlaceholder,
  ensureSalespersonOnboarding,
  findOnboardingByTokenHash,
  hashVerificationToken,
  insertIdentity,
  insertSigningSession,
  listAdminQueue,
  listCurrentIdentity,
  loadIdentity,
  loadOnboarding,
  loadPendingSession,
  loadProgress,
  loadSignatureForVersion,
  loadW9,
  newVerificationToken,
  publishNonCompeteVersion,
  refreshVerification,
  saveInformation,
  saveW9,
  setVerificationHash,
} from "../lib/jobBoardingStore";
import { isMissingSchemaError } from "../lib/orderSchemaGuard";
import {
  EsignatureNotConfiguredError,
  EsignatureProviderError,
  esignatureConfigured,
  getEsignatureProvider,
} from "../lib/docusealProvider";
import {
  DEFAULT_NON_COMPETE_TERM_YEARS,
  IDENTITY_LABELS,
  NON_COMPETE_PLACEHOLDER,
  SALESPERSON_IDENTITY_PREFIX,
  SALESPERSON_LEGAL_DOCUMENT_PREFIX,
  SALESPERSON_TAX_CLASSIFICATIONS,
  W9_ABOUT_URL,
  W9_OFFICIAL_PDF_URL,
  W9_PLACEHOLDER_NOTE,
  buildJobBoardingSignerExternalId,
  evaluateJobBoarding,
  identityFileView,
  isNonCompetePlaceholder,
  jobBoardingBlockerMessage,
  jobBoardingTinView,
  nonCompeteTermLabel,
  normalizeTaxId,
  salespersonEDocPath,
  salespersonVerificationPath,
} from "@shared/jobBoarding";

const NOTE_NOT_CONFIGURED =
  "DocuSeal not configured. An administrator must set DOCUSEAL_API_KEY (and DOCUSEAL_WEBHOOK_SECRET) in the server environment before the non-compete can be signed.";

const SIGNED_URL_SECONDS = 300;

function requireDb<T>(db: T | null): T {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

function providerError(error: unknown): TRPCError {
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

function extensionFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpg";
}

async function packetFor(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number) {
  const profile = await loadOnboarding(db, userId);
  const { document, version } = await ensureNonCompetePlaceholder(db);
  const signature = version ? await loadSignatureForVersion(db, userId, version.id) : null;
  const session = version ? await loadPendingSession(db, userId, version.id) : null;
  const w9 = await loadW9(db, userId);
  const identity = await listCurrentIdentity(db, userId);
  const progress = evaluateJobBoarding({
    informationComplete: Boolean(profile?.informationCompletedAt),
    nonCompeteSigned: Boolean(signature),
    w9Submitted: Boolean(w9?.submittedAt),
    identityUploaded: identity.length > 0,
  });
  return { profile, document, version, signature, session, w9, identity, progress };
}

function publicPacket(
  user: { id: number; role: string; email: string | null },
  packet: Awaited<ReturnType<typeof packetFor>>,
) {
  const termYears = packet.version?.termYears ?? packet.document?.termYears ?? DEFAULT_NON_COMPETE_TERM_YEARS;
  const tin = jobBoardingTinView({
    viewerRole: user.role,
    viewerId: user.id,
    ownerUserId: user.id,
    last4: packet.w9?.tinLast4 ?? null,
    plaintext: null,
    reveal: false,
  });
  return {
    schemaMissing: false,
    enrolled: Boolean(packet.profile) || user.role === "sales_rep",
    verified: packet.progress.verified,
    blockers: packet.progress.blockers,
    blockerMessages: packet.progress.blockers.map(jobBoardingBlockerMessage),
    accountActive: user.role === "sales_rep" && packet.progress.verified,
    role: user.role,
    eDocPath: "/job-boarding",
    information: {
      fullName: packet.profile?.fullName ?? "",
      email: packet.profile?.email ?? user.email ?? "",
      phone: packet.profile?.phone ?? "",
      businessName: packet.profile?.businessName ?? "",
      licenseNumber: packet.profile?.licenseNumber ?? "",
      address1: packet.profile?.address1 ?? "",
      address2: packet.profile?.address2 ?? "",
      city: packet.profile?.city ?? "",
      state: packet.profile?.state ?? "",
      postalCode: packet.profile?.postalCode ?? "",
      complete: Boolean(packet.profile?.informationCompletedAt),
    },
    nonCompete: {
      documentId: packet.document?.id ?? null,
      title: packet.version?.title ?? packet.document?.title ?? "Salesperson non-compete",
      version: packet.version?.version ?? null,
      versionId: packet.version?.id ?? null,
      termYears,
      termLabel: nonCompeteTermLabel(termYears),
      placeholder: isNonCompetePlaceholder(packet.version?.bodyMarkdown) || packet.version == null,
      body: packet.version?.kind === "pdf"
        ? NON_COMPETE_PLACEHOLDER
        : (packet.version?.bodyMarkdown ?? NON_COMPETE_PLACEHOLDER),
      kind: packet.version?.kind ?? "markdown",
      filename: packet.version?.filename ?? null,
      signed: Boolean(packet.signature),
      signedAt: packet.signature?.completedAt ?? null,
      inProgress: packet.session?.status === "pending",
      signingReady: packet.version?.docusealTemplateId != null && !packet.signature,
      providerConfigured: esignatureConfigured(),
      metadata: {
        termYears,
        termLabel: nonCompeteTermLabel(termYears),
        placeholder: isNonCompetePlaceholder(packet.version?.bodyMarkdown),
      },
    },
    w9: {
      submitted: Boolean(packet.w9?.submittedAt),
      legalName: packet.w9?.legalName ?? "",
      businessName: packet.w9?.businessName ?? "",
      taxClassification: packet.w9?.taxClassification ?? null,
      llcClassification: packet.w9?.llcClassification ?? "",
      address: packet.w9?.address ?? "",
      city: packet.w9?.city ?? "",
      state: packet.w9?.state ?? "",
      zip: packet.w9?.zip ?? "",
      tinType: packet.w9?.tinType ?? null,
      tinMasked: tin.ok ? tin.masked : null,
      tin: null,
      signatureName: packet.w9?.signatureName ?? "",
      signedOn: packet.w9?.signedOn ?? "",
      officialPdfUrl: W9_OFFICIAL_PDF_URL,
      aboutUrl: W9_ABOUT_URL,
      placeholderNote: W9_PLACEHOLDER_NOTE,
    },
    identity: {
      uploaded: packet.identity.length > 0,
      files: packet.identity.map(identityFileView),
    },
  };
}

const informationInput = z.object({
  fullName: z.string().trim().min(2).max(256),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(7).max(32),
  businessName: z.string().trim().min(2).max(256),
  licenseNumber: z.string().trim().max(64).nullable().optional(),
  address1: z.string().trim().min(4).max(256),
  address2: z.string().trim().max(256).nullable().optional(),
  city: z.string().trim().min(2).max(128),
  state: z.string().trim().min(2).max(64),
  postalCode: z.string().trim().min(3).max(16),
});

export const jobBoardingRouter = router({
  myStatus: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = requireDb(await getDb());
      const packet = await packetFor(db, ctx.user.id);
      return publicPacket(ctx.user, packet);
    } catch (error) {
      if (!isMissingSchemaError(error)) throw error;
      return {
        schemaMissing: true,
        enrolled: ctx.user.role === "sales_rep",
        verified: false,
        blockers: ["information", "non_compete", "w9", "identity"] as const,
        blockerMessages: [],
        accountActive: false,
        role: ctx.user.role,
        eDocPath: "/job-boarding",
        information: null,
        nonCompete: null,
        w9: null,
        identity: null,
      };
    }
  }),

  begin: protectedProcedure.mutation(async ({ ctx }) => {
    const db = requireDb(await getDb());
    await ensureSalespersonOnboarding(db, {
      id: ctx.user.id,
      email: ctx.user.email ?? null,
      name: ctx.user.name ?? null,
      companyName: null,
    });
    return { ok: true as const, eDocPath: "/job-boarding" };
  }),

  saveInformation: protectedProcedure.input(informationInput).mutation(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    await saveInformation(db, ctx.user.id, {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      businessName: input.businessName,
      licenseNumber: input.licenseNumber?.trim() || null,
      address1: input.address1,
      address2: input.address2?.trim() || null,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
    });
    await refreshVerification(db, ctx.user.id);
    return { ok: true as const };
  }),

  startSigning: protectedProcedure.input(z.object({
    consent: z.literal(true),
    typedLegalName: z.string().trim().min(2).max(255),
  })).mutation(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    const progress = await loadProgress(db, ctx.user.id);
    if (!progress.informationComplete) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Enter your information before signing the non-compete." });
    }
    if (!esignatureConfigured()) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: NOTE_NOT_CONFIGURED });
    }
    const { document, version } = await ensureNonCompetePlaceholder(db);
    if (!document || !version) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The non-compete has not been published yet." });
    }
    if (!version.docusealTemplateId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "This non-compete version has no DocuSeal template yet. An admin must attach one before it can be signed.",
      });
    }
    const already = await loadSignatureForVersion(db, ctx.user.id, version.id);
    if (already) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "You already signed this version." });
    }
    const signerEmail = (ctx.user.email ?? "").trim();
    if (!signerEmail) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your account has no email address. Add one before signing." });
    }
    const termYears = version.termYears || DEFAULT_NON_COMPETE_TERM_YEARS;
    const metadata = {
      termYears,
      termLabel: nonCompeteTermLabel(termYears),
      placeholder: isNonCompetePlaceholder(version.bodyMarkdown),
      version: version.version,
      title: version.title,
    };
    const pending = await loadPendingSession(db, ctx.user.id, version.id);
    if (pending?.providerSubmissionId) {
      try {
        const resumed = await getEsignatureProvider().resumeSigningRequest({
          submissionId: pending.providerSubmissionId,
          submitterId: pending.providerSubmitterId,
        });
        if (resumed) {
          return { embedSrc: resumed.embedSrc, resume: true, metadata };
        }
      } catch (error) {
        console.error(
          "[Job Boarding] Could not resume the open signing request:",
          error instanceof Error ? error.message : "unknown error",
        );
      }
    }
    const externalId = buildJobBoardingSignerExternalId({ userId: ctx.user.id, documentVersionId: version.id });
    let created: { submissionId: string; submitterId: string | null; embedSrc: string };
    try {
      created = await getEsignatureProvider().createSigningRequest({
        templateId: version.docusealTemplateId,
        signer: { name: input.typedLegalName, email: signerEmail, externalId },
        metadata: {
          userId: String(ctx.user.id),
          documentVersionId: String(version.id),
          termYears: String(termYears),
          documentSlug: document.slug,
        },
      });
    } catch (error) {
      throw providerError(error);
    }
    await insertSigningSession(db, {
      userId: ctx.user.id,
      documentId: document.id,
      documentVersionId: version.id,
      providerSubmissionId: created.submissionId,
      providerSubmitterId: created.submitterId,
    });
    return { embedSrc: created.embedSrc, resume: false, metadata };
  }),

  submitW9: protectedProcedure.input(z.object({
    legalName: z.string().trim().min(2).max(256),
    businessName: z.string().trim().max(256).nullable().optional(),
    taxClassification: z.enum(SALESPERSON_TAX_CLASSIFICATIONS),
    llcClassification: z.string().trim().max(8).nullable().optional(),
    address: z.string().trim().min(4).max(256),
    city: z.string().trim().min(2).max(128),
    state: z.string().trim().min(2).max(64),
    zip: z.string().trim().min(3).max(16),
    tinType: z.enum(["ssn", "ein"]),
    tin: z.string().trim().min(9).max(20),
    signatureName: z.string().trim().min(2).max(256),
    signedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })).mutation(async ({ ctx, input }) => {
    const progress = await loadProgress(requireDb(await getDb()), ctx.user.id);
    if (!progress.nonCompeteSigned) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sign the non-compete before the W-9." });
    }
    const normalized = normalizeTaxId(input.tin, input.tinType);
    if (!normalized.ok) throw new TRPCError({ code: "BAD_REQUEST", message: normalized.message });
    let tinEnvelope: string;
    try {
      tinEnvelope = encryptW9TaxId(normalized.digits);
    } catch (error) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: error instanceof Error ? error.message : "Tax ID encryption is not configured.",
      });
    }
    if (tinEnvelope.includes(normalized.digits)) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Tax ID could not be stored." });
    }
    const db = requireDb(await getDb());
    await saveW9(db, ctx.user.id, {
      legalName: input.legalName,
      businessName: input.businessName?.trim() || null,
      taxClassification: input.taxClassification,
      llcClassification: input.llcClassification?.trim() || null,
      address: input.address,
      city: input.city,
      state: input.state,
      zip: input.zip,
      tinEnvelope,
      tinLast4: normalized.last4,
      tinType: input.tinType,
      signatureName: input.signatureName,
      signedOn: input.signedOn,
    });
    await refreshVerification(db, ctx.user.id);
    const view = jobBoardingTinView({
      viewerRole: ctx.user.role,
      viewerId: ctx.user.id,
      ownerUserId: ctx.user.id,
      last4: normalized.last4,
      plaintext: normalized.digits,
      reveal: false,
    });
    return { ok: true as const, tinMasked: view.ok ? view.masked : null, tin: null };
  }),

  uploadIdentity: protectedProcedure.input(z.object({
    fileBase64: z.string().min(1),
    fileName: z.string().max(255).optional(),
    mimeType: z.string().max(128),
    label: z.enum(IDENTITY_LABELS).default("front"),
  })).mutation(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    const progress = await loadProgress(db, ctx.user.id);
    if (!progress.w9Submitted) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Submit the W-9 before uploading an ID." });
    }
    const bytes = decodeAffiliateDocumentUpload(input.fileBase64);
    const sniffed = sniffAffiliateDocumentMime(bytes);
    if (!affiliateDocumentMimeMatches(input.mimeType, sniffed) || !sniffed) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a JPEG, PNG, PDF, or HEIC image of your government ID." });
    }
    const stored = await storagePut(
      `${SALESPERSON_IDENTITY_PREFIX}${ctx.user.id}/id-${input.label}.${extensionFor(sniffed)}`,
      bytes,
      sniffed,
    );
    if (!stored.key.startsWith(SALESPERSON_IDENTITY_PREFIX)) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The ID could not be stored privately." });
    }
    await insertIdentity(db, {
      userId: ctx.user.id,
      label: input.label,
      storageKey: stored.key,
      mimeType: sniffed,
      sizeBytes: bytes.length,
      originalName: displayNameFor(input.fileName),
    });
    await refreshVerification(db, ctx.user.id);
    return { ok: true as const };
  }),

  issueMyVerificationLink: protectedProcedure.mutation(async ({ ctx }) => {
    const db = requireDb(await getDb());
    const row = await loadOnboarding(db, ctx.user.id);
    if (!row) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Start Job Boarding before creating a verification link." });
    const issued = newVerificationToken();
    await setVerificationHash(db, ctx.user.id, issued.hash);
    return { path: salespersonVerificationPath(issued.token) };
  }),

  openVerification: protectedProcedure.input(z.object({
    token: z.string().trim().min(20).max(200),
  })).query(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    const match = await findOnboardingByTokenHash(db, hashVerificationToken(input.token));
    if (!match || match.userId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "This verification link does not belong to the signed-in account." });
    }
    const packet = await packetFor(db, ctx.user.id);
    return publicPacket(ctx.user, packet);
  }),

  adminList: adminProcedure.query(async () => {
    const db = requireDb(await getDb());
    const rows = await listAdminQueue(db);
    return rows.map((row) => ({
      ...row,
      eDocPath: salespersonEDocPath(row.userId),
      verifiedLabel: row.verified ? "yes" : "no",
    }));
  }),

  adminReview: adminProcedure.input(z.object({
    userId: z.number().int().positive(),
  })).query(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    const packet = await packetFor(db, input.userId);
    if (!packet.profile) throw new TRPCError({ code: "NOT_FOUND", message: "That salesperson has not started Job Boarding." });
    const termYears = packet.version?.termYears ?? DEFAULT_NON_COMPETE_TERM_YEARS;
    const tin = jobBoardingTinView({
      viewerRole: ctx.user.role,
      viewerId: ctx.user.id,
      ownerUserId: input.userId,
      last4: packet.w9?.tinLast4 ?? null,
      plaintext: null,
      reveal: false,
    });
    if (!tin.ok) throw new TRPCError({ code: "FORBIDDEN" });
    return {
      userId: input.userId,
      eDocPath: salespersonEDocPath(input.userId),
      verified: packet.progress.verified,
      verifiedLabel: packet.progress.verified ? "yes" : "no",
      blockers: packet.progress.blockers,
      information: {
        fullName: packet.profile.fullName,
        email: packet.profile.email,
        phone: packet.profile.phone,
        businessName: packet.profile.businessName,
        licenseNumber: packet.profile.licenseNumber,
        address1: packet.profile.address1,
        address2: packet.profile.address2,
        city: packet.profile.city,
        state: packet.profile.state,
        postalCode: packet.profile.postalCode,
        complete: Boolean(packet.profile.informationCompletedAt),
      },
      nonCompete: {
        version: packet.signature ? packet.version?.version ?? null : null,
        currentVersion: packet.version?.version ?? null,
        termYears,
        termLabel: nonCompeteTermLabel(termYears),
        signed: Boolean(packet.signature),
        signedAt: packet.signature?.completedAt ?? null,
        placeholder: isNonCompetePlaceholder(packet.version?.bodyMarkdown),
        templateAttached: packet.version?.docusealTemplateId != null,
      },
      w9: packet.w9
        ? {
          submitted: true,
          legalName: packet.w9.legalName,
          businessName: packet.w9.businessName,
          taxClassification: packet.w9.taxClassification,
          address: packet.w9.address,
          city: packet.w9.city,
          state: packet.w9.state,
          zip: packet.w9.zip,
          tinType: packet.w9.tinType,
          tinMasked: tin.masked,
          tin: null,
          signatureName: packet.w9.signatureName,
          signedOn: packet.w9.signedOn,
          submittedAt: packet.w9.submittedAt,
        }
        : { submitted: false, tinMasked: null, tin: null },
      identity: packet.identity.map(identityFileView),
      officialPdfUrl: W9_OFFICIAL_PDF_URL,
      placeholderNote: W9_PLACEHOLDER_NOTE,
    };
  }),

  adminRevealTin: adminProcedure.input(z.object({
    userId: z.number().int().positive(),
  })).query(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    const w9 = await loadW9(db, input.userId);
    if (!w9) throw new TRPCError({ code: "NOT_FOUND", message: "No W-9 is on file." });
    let plaintext: string;
    try {
      plaintext = decryptW9TaxId(w9.tinEnvelope);
    } catch (error) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: error instanceof Error ? error.message : "The saved tax ID could not be read.",
      });
    }
    const view = jobBoardingTinView({
      viewerRole: ctx.user.role,
      viewerId: ctx.user.id,
      ownerUserId: input.userId,
      last4: w9.tinLast4,
      plaintext,
      reveal: true,
    });
    if (!view.ok || view.tin == null) throw new TRPCError({ code: "FORBIDDEN" });
    return { tin: view.tin, tinMasked: view.masked, tinType: w9.tinType };
  }),

  adminIdentityLink: adminProcedure.input(z.object({
    documentId: z.number().int().positive(),
  })).mutation(async ({ input }) => {
    const db = requireDb(await getDb());
    const row = await loadIdentity(db, input.documentId);
    if (!row || row.supersededAt) throw new TRPCError({ code: "NOT_FOUND", message: "That ID is not on file." });
    if (!row.storageKey.startsWith(SALESPERSON_IDENTITY_PREFIX)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That file is not a Job Boarding ID." });
    }
    const url = await storageGetSignedUrl(row.storageKey, SIGNED_URL_SECONDS);
    return { url, expiresInSeconds: SIGNED_URL_SECONDS };
  }),

  adminIssueVerificationLink: adminProcedure.input(z.object({
    userId: z.number().int().positive(),
  })).mutation(async ({ input }) => {
    const db = requireDb(await getDb());
    const row = await loadOnboarding(db, input.userId);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That salesperson has not started Job Boarding." });
    const issued = newVerificationToken();
    await setVerificationHash(db, input.userId, issued.hash);
    return { path: salespersonVerificationPath(issued.token), eDocPath: salespersonEDocPath(input.userId) };
  }),

  adminPublishNonCompete: adminProcedure.input(z.object({
    title: z.string().trim().min(2).max(255).default("Salesperson non-compete"),
    termYears: z.number().int().min(1).max(10).default(DEFAULT_NON_COMPETE_TERM_YEARS),
    bodyMarkdown: z.string().trim().min(1).max(100_000).optional(),
    pdfBase64: z.string().min(1).optional(),
    pdfFileName: z.string().max(255).optional(),
    docusealTemplateId: z.number().int().positive().nullable().optional(),
    buildTemplate: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    const body = input.bodyMarkdown?.trim() || null;
    if (!body && !input.pdfBase64) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Paste the document text or upload a PDF. The placeholder is available if the final contract is not ready." });
    }
    let kind: "markdown" | "pdf" = "markdown";
    let fileKey: string | null = null;
    let filename: string | null = null;
    let mimeType: string | null = null;
    let sizeBytes: number | null = null;
    let contentSha256: string;
    let templateId = input.docusealTemplateId ?? null;
    if (input.pdfBase64) {
      const bytes = decodeAffiliateDocumentUpload(input.pdfBase64);
      if (sniffAffiliateDocumentMime(bytes) !== "application/pdf") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The replacement file must be a PDF." });
      }
      const stored = await storagePut(
        `${SALESPERSON_LEGAL_DOCUMENT_PREFIX}non-compete.pdf`,
        bytes,
        "application/pdf",
      );
      if (!stored.key.startsWith(SALESPERSON_LEGAL_DOCUMENT_PREFIX)) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The document could not be stored privately." });
      }
      kind = "pdf";
      fileKey = stored.key;
      filename = displayNameFor(input.pdfFileName) ?? "non-compete.pdf";
      mimeType = "application/pdf";
      sizeBytes = bytes.length;
      contentSha256 = createHash("sha256").update(bytes).digest("hex");
      if (input.buildTemplate) {
        try {
          const built = await getEsignatureProvider().createTemplateFromPdf({
            name: input.title,
            pdf: bytes,
          });
          const parsed = Number(built.templateId);
          if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new EsignatureProviderError("DocuSeal returned an unusable template id.");
          }
          templateId = parsed;
        } catch (error) {
          throw providerError(error);
        }
      }
    } else {
      contentSha256 = createHash("sha256").update(body!).digest("hex");
    }
    const published = await publishNonCompeteVersion(db, {
      title: input.title,
      termYears: input.termYears,
      kind,
      bodyMarkdown: body,
      fileKey,
      filename,
      mimeType,
      sizeBytes,
      contentSha256,
      docusealTemplateId: templateId,
      createdByUserId: ctx.user.id,
    });
    return {
      ok: true as const,
      version: published.version?.version ?? null,
      termYears: input.termYears,
      termLabel: nonCompeteTermLabel(input.termYears),
      placeholder: isNonCompetePlaceholder(body),
    };
  }),
});
