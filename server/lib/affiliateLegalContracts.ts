/**
 * Affiliate legal contract state: the onboarding gate and the append-only
 * signature record.
 *
 * Everything in this file works from the tables alone. The provider (DocuSeal)
 * is only involved when a signature is first offered or when its webhook is
 * recorded, so `hasSignedAllRequired` never touches the network and cannot fail
 * because a provider is down.
 */

import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  affiliateLegalDocuments,
  affiliateLegalDocumentVersions,
  affiliateLegalSignatures,
  affiliateLegalSigningSessions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  LEGAL_SIGNATURE_FILE_PREFIX,
  legalDocumentGate,
  type LegalDocumentGate,
  type LegalDocumentGateRow,
} from "@shared/affiliateLegalDocuments";
import { storagePut } from "../storage";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type LegalDocumentWithVersion = {
  document: typeof affiliateLegalDocuments.$inferSelect;
  version: (typeof affiliateLegalDocumentVersions.$inferSelect) | null;
};

/** Every legal document with its current version, in portal order. */
export async function loadLegalDocumentsWithCurrentVersion(
  db: Database,
  options: { activeOnly?: boolean } = {},
): Promise<LegalDocumentWithVersion[]> {
  const documents = await db
    .select()
    .from(affiliateLegalDocuments)
    .orderBy(affiliateLegalDocuments.sortOrder, affiliateLegalDocuments.id);
  const filtered = options.activeOnly ? documents.filter((row) => row.isActive) : documents;
  const versionIds = filtered
    .map((row) => row.currentVersionId)
    .filter((id): id is number => typeof id === "number" && id > 0);
  const versions = versionIds.length
    ? await db
        .select()
        .from(affiliateLegalDocumentVersions)
        .where(inArray(affiliateLegalDocumentVersions.id, versionIds))
    : [];
  const byId = new Map(versions.map((row) => [row.id, row]));
  return filtered.map((document) => ({
    document,
    version: document.currentVersionId != null ? byId.get(document.currentVersionId) ?? null : null,
  }));
}

/** Signatures for one affiliate, newest first. Append-only: nothing here writes. */
export async function loadAffiliateSignatures(db: Database, affiliateId: number) {
  return db
    .select()
    .from(affiliateLegalSignatures)
    .where(eq(affiliateLegalSignatures.affiliateId, affiliateId))
    .orderBy(desc(affiliateLegalSignatures.completedAt), desc(affiliateLegalSignatures.id));
}

/**
 * The complete gate for one affiliate: which required contracts are signed,
 * which are still open, and whether membership onboarding may proceed.
 *
 * A signature only counts when it is on the document's CURRENT version. When an
 * admin publishes a new version the old signature stays on record but no longer
 * satisfies the gate, which is the whole point of immutable versions.
 */
export async function loadLegalDocumentGate(db: Database, affiliateId: number): Promise<LegalDocumentGate> {
  const documents = await loadLegalDocumentsWithCurrentVersion(db);
  const signatures = await loadAffiliateSignatures(db, affiliateId);
  const signedVersionIds = new Set(signatures.map((row) => row.documentVersionId));

  const sessions = await db
    .select({
      documentVersionId: affiliateLegalSigningSessions.documentVersionId,
      status: affiliateLegalSigningSessions.status,
      createdAt: affiliateLegalSigningSessions.createdAt,
    })
    .from(affiliateLegalSigningSessions)
    .where(eq(affiliateLegalSigningSessions.affiliateId, affiliateId))
    .orderBy(desc(affiliateLegalSigningSessions.createdAt));

  const latestSession = new Map<number, (typeof sessions)[number]>();
  for (const session of sessions) {
    if (!latestSession.has(session.documentVersionId)) latestSession.set(session.documentVersionId, session);
  }

  const rows: LegalDocumentGateRow[] = documents.map(({ document, version }) => {
    const signature = version && signedVersionIds.has(version.id)
      ? signatures.find((row) => row.documentVersionId === version.id) ?? null
      : null;
    return {
      documentId: document.id,
      slug: document.slug,
      title: document.title,
      isActive: document.isActive,
      requiredForMembership: document.requiredForMembership,
      currentVersionId: version?.id ?? null,
      currentVersionNumber: version?.version ?? null,
      signedAt: signature?.completedAt ?? null,
      sessionStatus: version ? latestSession.get(version.id)?.status ?? null : null,
    };
  });

  return legalDocumentGate(rows);
}

/**
 * The onboarding gate helper. True only when every active, required contract has
 * a signature on its current version. A required contract with no published
 * version keeps this false, so onboarding cannot pass on a missing document.
 */
export async function hasSignedAllRequired(affiliateId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const gate = await loadLegalDocumentGate(db, affiliateId);
  return gate.signedAll;
}

export type RecordSignatureInput = {
  affiliateId: number;
  userId: number | null;
  documentId: number;
  documentVersionId: number;
  provider: "docuseal";
  providerSubmissionId: string;
  providerSubmitterId: string | null;
  providerEventId: string | null;
  signerName: string | null;
  signerEmail: string | null;
  signerIp: string | null;
  signerUserAgent: string | null;
  providerAuditLogUrl: string | null;
  completedAt: Date;
};

export type RecordSignatureResult =
  | { ok: true; signatureId: number; duplicate: boolean }
  | { ok: false; reason: string };

/**
 * Stores one completed signature, append-only.
 *
 * There is no update and no delete: a unique key on
 * (affiliateId, documentVersionId) makes a replayed webhook return the existing
 * row instead of writing a second signature, and a second unique key on the
 * provider event id catches a replay that arrives with a different pair.
 */
export async function recordSignature(db: Database, input: RecordSignatureInput): Promise<RecordSignatureResult> {
  const [version] = await db
    .select()
    .from(affiliateLegalDocumentVersions)
    .where(eq(affiliateLegalDocumentVersions.id, input.documentVersionId))
    .limit(1);
  if (!version || version.documentId !== input.documentId) {
    return { ok: false, reason: "That document version does not exist." };
  }
  const [document] = await db
    .select()
    .from(affiliateLegalDocuments)
    .where(eq(affiliateLegalDocuments.id, input.documentId))
    .limit(1);
  if (!document) return { ok: false, reason: "That document does not exist." };

  const existing = await db
    .select({ id: affiliateLegalSignatures.id })
    .from(affiliateLegalSignatures)
    .where(
      or(
        and(
          eq(affiliateLegalSignatures.affiliateId, input.affiliateId),
          eq(affiliateLegalSignatures.documentVersionId, input.documentVersionId),
        ),
        ...(input.providerEventId
          ? [eq(affiliateLegalSignatures.providerEventId, input.providerEventId)]
          : []),
      ),
    )
    .limit(1);
  if (existing[0]) return { ok: true, signatureId: existing[0].id, duplicate: true };

  const result = await db.insert(affiliateLegalSignatures).values({
    affiliateId: input.affiliateId,
    userId: input.userId,
    documentId: input.documentId,
    documentVersionId: input.documentVersionId,
    documentSlug: document.slug,
    documentVersion: version.version,
    documentTitle: version.title || document.title,
    contentSha256: version.contentSha256,
    provider: input.provider,
    providerSubmissionId: input.providerSubmissionId,
    providerSubmitterId: input.providerSubmitterId,
    providerEventId: input.providerEventId,
    signerName: input.signerName,
    signerEmail: input.signerEmail,
    signerIp: input.signerIp,
    signerUserAgent: input.signerUserAgent,
    providerAuditLogUrl: input.providerAuditLogUrl,
    completedAt: input.completedAt,
  });
  const signatureId = Number((result as unknown as [{ insertId: number }])[0]?.insertId ?? 0);
  return { ok: true, signatureId, duplicate: false };
}

/**
 * Copies the provider's evidence into our private bucket. The signature row is
 * already written when this runs: a storage failure leaves the record intact
 * and only the copy missing, and the caller reports that instead of unwinding a
 * signature that legally exists.
 */
export async function storeSignatureArtifacts(
  db: Database,
  input: {
    signatureId: number;
    affiliateId: number;
    documentVersionId: number;
    signedPdf?: { bytes: Buffer; mimeType: string; filename: string } | null;
    auditLog?: { bytes: Buffer; mimeType: string; filename: string } | null;
  },
): Promise<{ signedPdfKey: string | null; auditLogKey: string | null }> {
  const folder = `${LEGAL_SIGNATURE_FILE_PREFIX}a${input.affiliateId}/v${input.documentVersionId}/`;
  let signedPdfKey: string | null = null;
  let auditLogKey: string | null = null;

  if (input.signedPdf) {
    const stored = await storagePut(
      `${folder}signed-${input.signatureId}-${input.signedPdf.filename}`,
      input.signedPdf.bytes,
      input.signedPdf.mimeType,
    );
    signedPdfKey = stored.key;
  }
  if (input.auditLog) {
    const stored = await storagePut(
      `${folder}audit-${input.signatureId}-${input.auditLog.filename}`,
      input.auditLog.bytes,
      input.auditLog.mimeType,
    );
    auditLogKey = stored.key;
  }

  if (signedPdfKey || auditLogKey) {
    // The only write a signature row ever receives. It adds the storage keys to
    // a row already written; it never changes who signed, when, or what.
    await db
      .update(affiliateLegalSignatures)
      .set({
        ...(signedPdfKey ? { signedPdfKey } : {}),
        ...(auditLogKey ? { auditLogKey } : {}),
      })
      .where(eq(affiliateLegalSignatures.id, input.signatureId));
  }
  return { signedPdfKey, auditLogKey };
}

/** One open signing session per (affiliate, version): the newest pending row wins. */
export async function findPendingSession(db: Database, affiliateId: number, documentVersionId: number) {
  const [row] = await db
    .select()
    .from(affiliateLegalSigningSessions)
    .where(
      and(
        eq(affiliateLegalSigningSessions.affiliateId, affiliateId),
        eq(affiliateLegalSigningSessions.documentVersionId, documentVersionId),
        eq(affiliateLegalSigningSessions.status, "pending"),
      ),
    )
    .orderBy(desc(affiliateLegalSigningSessions.createdAt))
    .limit(1);
  return row ?? null;
}

/** Marks every pending session for a completed submission as completed. */
export async function completeSessionsForSubmission(db: Database, submissionId: string): Promise<void> {
  await db
    .update(affiliateLegalSigningSessions)
    .set({ status: "completed" })
    .where(
      and(
        eq(affiliateLegalSigningSessions.providerSubmissionId, submissionId),
        eq(affiliateLegalSigningSessions.status, "pending"),
      ),
    );
}

export async function markSessionStatus(
  db: Database,
  submissionId: string,
  status: "declined" | "expired",
): Promise<void> {
  await db
    .update(affiliateLegalSigningSessions)
    .set({ status })
    .where(
      and(
        eq(affiliateLegalSigningSessions.providerSubmissionId, submissionId),
        eq(affiliateLegalSigningSessions.status, "pending"),
      ),
    );
}

/** Sessions belonging to one affiliate, for the portal's "in progress" state. */
export async function loadAffiliateSessions(db: Database, affiliateId: number) {
  return db
    .select()
    .from(affiliateLegalSigningSessions)
    .where(eq(affiliateLegalSigningSessions.affiliateId, affiliateId))
    .orderBy(desc(affiliateLegalSigningSessions.createdAt));
}
