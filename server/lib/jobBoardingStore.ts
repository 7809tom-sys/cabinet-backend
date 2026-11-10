import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  salespersonIdentityDocuments,
  salespersonLegalDocuments,
  salespersonLegalDocumentVersions,
  salespersonLegalSignatures,
  salespersonLegalSigningSessions,
  salespersonOnboarding,
  salespersonW9,
  users,
} from "../../drizzle/schema";
import {
  DEFAULT_NON_COMPETE_TERM_YEARS,
  NON_COMPETE_PLACEHOLDER,
  NON_COMPETE_SLUG,
  NON_COMPETE_TITLE,
  evaluateJobBoarding,
  type JobBoardingProgress,
} from "@shared/jobBoarding";
import { isMissingSchemaError } from "./orderSchemaGuard";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function insertedId(result: unknown): number {
  if (Array.isArray(result)) {
    const first = result[0] as { insertId?: number } | undefined;
    if (first?.insertId) return Number(first.insertId);
  }
  const direct = result as { insertId?: number } | null;
  return Number(direct?.insertId ?? 0);
}

export function newVerificationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashVerificationToken(token) };
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function loadOnboarding(db: Database, userId: number) {
  const [row] = await db.select().from(salespersonOnboarding).where(eq(salespersonOnboarding.userId, userId)).limit(1);
  return row ?? null;
}

export async function ensureSalespersonOnboarding(
  db: Database,
  user: { id: number; email: string | null; name: string | null; companyName?: string | null },
) {
  const existing = await loadOnboarding(db, user.id);
  if (existing) return existing;
  await db.insert(salespersonOnboarding).values({
    userId: user.id,
    fullName: user.name,
    email: user.email,
    businessName: user.companyName ?? null,
  });
  return loadOnboarding(db, user.id);
}

export async function saveInformation(
  db: Database,
  userId: number,
  fields: {
    fullName: string;
    email: string;
    phone: string;
    businessName: string;
    licenseNumber: string | null;
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    postalCode: string;
  },
) {
  const existing = await loadOnboarding(db, userId);
  const patch = { ...fields, informationCompletedAt: new Date() };
  if (!existing) {
    await db.insert(salespersonOnboarding).values({ userId, ...patch });
  } else {
    await db.update(salespersonOnboarding).set(patch).where(eq(salespersonOnboarding.userId, userId));
  }
  return loadOnboarding(db, userId);
}

export async function setVerificationHash(db: Database, userId: number, hash: string) {
  const existing = await loadOnboarding(db, userId);
  if (!existing) return null;
  await db.update(salespersonOnboarding).set({ verificationTokenHash: hash }).where(eq(salespersonOnboarding.userId, userId));
  return loadOnboarding(db, userId);
}

export async function findOnboardingByTokenHash(db: Database, hash: string) {
  const [row] = await db.select().from(salespersonOnboarding).where(eq(salespersonOnboarding.verificationTokenHash, hash)).limit(1);
  return row ?? null;
}

async function loadDocument(db: Database) {
  const [row] = await db.select().from(salespersonLegalDocuments).where(eq(salespersonLegalDocuments.slug, NON_COMPETE_SLUG)).limit(1);
  return row ?? null;
}

export async function loadVersion(db: Database, versionId: number) {
  const [row] = await db.select().from(salespersonLegalDocumentVersions).where(eq(salespersonLegalDocumentVersions.id, versionId)).limit(1);
  return row ?? null;
}

/** Creates the placeholder document and version 1 when the seed SQL has not inserted them yet. */
export async function ensureNonCompetePlaceholder(db: Database) {
  let document = await loadDocument(db);
  if (!document) {
    const created = await db.insert(salespersonLegalDocuments).values({
      slug: NON_COMPETE_SLUG,
      title: NON_COMPETE_TITLE,
      summary: "Placeholder until Tom or his attorney supplies the contract.",
      termYears: DEFAULT_NON_COMPETE_TERM_YEARS,
      isActive: true,
    });
    const documentId = insertedId(created);
    document = documentId
      ? (await db.select().from(salespersonLegalDocuments).where(eq(salespersonLegalDocuments.id, documentId)).limit(1))[0] ?? null
      : await loadDocument(db);
  }
  if (!document) return { document: null, version: null };

  let version = document.currentVersionId ? await loadVersion(db, document.currentVersionId) : null;
  if (!version) {
    const [latest] = await db
      .select()
      .from(salespersonLegalDocumentVersions)
      .where(eq(salespersonLegalDocumentVersions.documentId, document.id))
      .orderBy(desc(salespersonLegalDocumentVersions.version))
      .limit(1);
    version = latest ?? null;
  }
  if (!version) {
    const inserted = await db.insert(salespersonLegalDocumentVersions).values({
      documentId: document.id,
      version: 1,
      title: NON_COMPETE_TITLE,
      termYears: document.termYears || DEFAULT_NON_COMPETE_TERM_YEARS,
      kind: "markdown",
      bodyMarkdown: NON_COMPETE_PLACEHOLDER,
      contentSha256: createHash("sha256").update(NON_COMPETE_PLACEHOLDER).digest("hex"),
      publishedAt: new Date(),
    });
    const versionId = insertedId(inserted);
    version = versionId ? await loadVersion(db, versionId) : null;
  }
  if (version && document.currentVersionId !== version.id) {
    await db.update(salespersonLegalDocuments).set({ currentVersionId: version.id }).where(eq(salespersonLegalDocuments.id, document.id));
    document = { ...document, currentVersionId: version.id };
  }
  return { document, version };
}

export async function loadSignatureForVersion(db: Database, userId: number, versionId: number) {
  const [row] = await db
    .select()
    .from(salespersonLegalSignatures)
    .where(and(eq(salespersonLegalSignatures.userId, userId), eq(salespersonLegalSignatures.documentVersionId, versionId)))
    .limit(1);
  return row ?? null;
}

export async function loadPendingSession(db: Database, userId: number, versionId: number) {
  const [row] = await db
    .select()
    .from(salespersonLegalSigningSessions)
    .where(and(
      eq(salespersonLegalSigningSessions.userId, userId),
      eq(salespersonLegalSigningSessions.documentVersionId, versionId),
      eq(salespersonLegalSigningSessions.status, "pending"),
    ))
    .orderBy(desc(salespersonLegalSigningSessions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function insertSigningSession(
  db: Database,
  values: {
    userId: number;
    documentId: number;
    documentVersionId: number;
    providerSubmissionId: string;
    providerSubmitterId: string | null;
  },
) {
  const result = await db.insert(salespersonLegalSigningSessions).values({
    ...values,
    provider: "docuseal",
    status: "pending",
  });
  return insertedId(result);
}

export async function loadW9(db: Database, userId: number) {
  const [row] = await db.select().from(salespersonW9).where(eq(salespersonW9.userId, userId)).limit(1);
  return row ?? null;
}

export async function saveW9(
  db: Database,
  userId: number,
  fields: {
    legalName: string;
    businessName: string | null;
    taxClassification: (typeof salespersonW9.$inferInsert)["taxClassification"];
    llcClassification: string | null;
    address: string;
    city: string;
    state: string;
    zip: string;
    tinEnvelope: string;
    tinLast4: string;
    tinType: "ssn" | "ein";
    signatureName: string;
    signedOn: string;
  },
) {
  const existing = await loadW9(db, userId);
  if (!existing) {
    await db.insert(salespersonW9).values({ userId, ...fields, submittedAt: new Date() });
  } else {
    await db.update(salespersonW9).set({ ...fields, submittedAt: new Date() }).where(eq(salespersonW9.userId, userId));
  }
  return loadW9(db, userId);
}

export async function listCurrentIdentity(db: Database, userId: number) {
  return db
    .select()
    .from(salespersonIdentityDocuments)
    .where(and(eq(salespersonIdentityDocuments.userId, userId), isNull(salespersonIdentityDocuments.supersededAt)))
    .orderBy(desc(salespersonIdentityDocuments.createdAt));
}

export async function insertIdentity(
  db: Database,
  values: {
    userId: number;
    label: "front" | "back" | "other";
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    originalName: string | null;
  },
) {
  const result = await db.insert(salespersonIdentityDocuments).values(values);
  return insertedId(result);
}

export async function loadIdentity(db: Database, id: number) {
  const [row] = await db.select().from(salespersonIdentityDocuments).where(eq(salespersonIdentityDocuments.id, id)).limit(1);
  return row ?? null;
}

export async function loadProgress(db: Database, userId: number): Promise<JobBoardingProgress> {
  const profile = await loadOnboarding(db, userId);
  const { version } = await currentNonCompete(db);
  const signature = version ? await loadSignatureForVersion(db, userId, version.id) : null;
  const w9 = await loadW9(db, userId);
  const identity = await listCurrentIdentity(db, userId);
  return {
    informationComplete: Boolean(profile?.informationCompletedAt),
    nonCompeteSigned: Boolean(signature),
    w9Submitted: Boolean(w9?.submittedAt),
    identityUploaded: identity.length > 0,
  };
}

async function currentNonCompete(db: Database) {
  const document = await loadDocument(db);
  if (!document?.currentVersionId) return { document, version: null };
  return { document, version: await loadVersion(db, document.currentVersionId) };
}

export async function refreshVerification(db: Database, userId: number): Promise<boolean> {
  const progress = await loadProgress(db, userId);
  const verified = evaluateJobBoarding(progress).verified;
  if (!verified) return false;
  const profile = await loadOnboarding(db, userId);
  if (profile && !profile.verifiedAt) {
    await db.update(salespersonOnboarding).set({
      verifiedAt: new Date(),
      activatedAt: new Date(),
    }).where(eq(salespersonOnboarding.userId, userId));
  }
  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (account?.role === "user") {
    await db.update(users).set({ role: "sales_rep" }).where(eq(users.id, userId));
  }
  return true;
}

export async function loadFeatureGate(userId: number): Promise<{ schemaMissing: boolean; verified: boolean; hasRow: boolean }> {
  const db = await getDb();
  if (!db) return { schemaMissing: false, verified: false, hasRow: false };
  try {
    const profile = await loadOnboarding(db, userId);
    if (!profile) return { schemaMissing: false, verified: false, hasRow: false };
    const progress = await loadProgress(db, userId);
    return { schemaMissing: false, verified: evaluateJobBoarding(progress).verified, hasRow: true };
  } catch (error) {
    if (isMissingSchemaError(error)) return { schemaMissing: true, verified: false, hasRow: false };
    throw error;
  }
}

export async function publishNonCompeteVersion(
  db: Database,
  input: {
    title: string;
    termYears: number;
    kind: "markdown" | "pdf";
    bodyMarkdown: string | null;
    fileKey: string | null;
    filename: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    contentSha256: string;
    docusealTemplateId: number | null;
    createdByUserId: number;
  },
) {
  const ensured = await ensureNonCompetePlaceholder(db);
  if (!ensured.document) throw new Error("The non-compete document could not be created.");
  const versions = await db
    .select({ version: salespersonLegalDocumentVersions.version })
    .from(salespersonLegalDocumentVersions)
    .where(eq(salespersonLegalDocumentVersions.documentId, ensured.document.id));
  const nextVersion = versions.reduce((max, row) => Math.max(max, row.version), 0) + 1;
  const inserted = await db.insert(salespersonLegalDocumentVersions).values({
    documentId: ensured.document.id,
    version: nextVersion,
    title: input.title,
    termYears: input.termYears,
    kind: input.kind,
    bodyMarkdown: input.bodyMarkdown,
    fileKey: input.fileKey,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    contentSha256: input.contentSha256,
    docusealTemplateId: input.docusealTemplateId,
    publishedAt: new Date(),
    createdByUserId: input.createdByUserId,
  });
  const versionId = insertedId(inserted);
  await db.update(salespersonLegalDocuments).set({
    currentVersionId: versionId,
    termYears: input.termYears,
    title: input.title,
  }).where(eq(salespersonLegalDocuments.id, ensured.document.id));
  const version = await loadVersion(db, versionId);
  return { documentId: ensured.document.id, version };
}

export type AdminQueueRow = {
  userId: number;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  accountRole: string | null;
  informationComplete: boolean;
  nonCompeteVersion: number | null;
  nonCompeteTermYears: number | null;
  nonCompeteSigned: boolean;
  w9Submitted: boolean;
  identityCount: number;
  verified: boolean;
};

export async function listAdminQueue(db: Database): Promise<AdminQueueRow[]> {
  const people = await db.select().from(salespersonOnboarding).orderBy(desc(salespersonOnboarding.createdAt));
  if (!people.length) return [];
  const { version } = await currentNonCompete(db);
  const userIds = people.map((row) => row.userId);
  const accounts = await db
    .select({ id: users.id, role: users.role, email: users.email, name: users.name })
    .from(users)
    .where(inArray(users.id, userIds));
  const signatures = version
    ? await db
      .select({ userId: salespersonLegalSignatures.userId })
      .from(salespersonLegalSignatures)
      .where(eq(salespersonLegalSignatures.documentVersionId, version.id))
    : [];
  const w9Rows = await db
    .select({ userId: salespersonW9.userId, submittedAt: salespersonW9.submittedAt })
    .from(salespersonW9)
    .where(inArray(salespersonW9.userId, userIds));
  const identity = await db
    .select({ userId: salespersonIdentityDocuments.userId })
    .from(salespersonIdentityDocuments)
    .where(and(inArray(salespersonIdentityDocuments.userId, userIds), isNull(salespersonIdentityDocuments.supersededAt)));
  const signed = new Set(signatures.map((row) => row.userId));
  const w9ByUser = new Set(w9Rows.filter((row) => row.submittedAt).map((row) => row.userId));
  const idCount = new Map<number, number>();
  for (const row of identity) idCount.set(row.userId, (idCount.get(row.userId) ?? 0) + 1);
  const accountById = new Map(accounts.map((row) => [row.id, row]));

  return people.map((row) => {
    const progress = evaluateJobBoarding({
      informationComplete: Boolean(row.informationCompletedAt),
      nonCompeteSigned: signed.has(row.userId),
      w9Submitted: w9ByUser.has(row.userId),
      identityUploaded: (idCount.get(row.userId) ?? 0) > 0,
    });
    const account = accountById.get(row.userId);
    return {
      userId: row.userId,
      fullName: row.fullName || account?.name || null,
      email: row.email || account?.email || null,
      phone: row.phone,
      accountRole: account?.role ?? null,
      informationComplete: Boolean(row.informationCompletedAt),
      nonCompeteVersion: signed.has(row.userId) ? version?.version ?? null : null,
      nonCompeteTermYears: version?.termYears ?? null,
      nonCompeteSigned: signed.has(row.userId),
      w9Submitted: w9ByUser.has(row.userId),
      identityCount: idCount.get(row.userId) ?? 0,
      verified: progress.verified,
    };
  });
}

export async function recordSalespersonSignature(
  db: Database,
  input: {
    userId: number;
    documentVersionId: number;
    providerSubmissionId: string;
    providerSubmitterId: string | null;
    providerEventId: string | null;
    signerName: string | null;
    signerEmail: string | null;
    completedAt: Date;
    signedPdfKey?: string | null;
    auditLogKey?: string | null;
  },
): Promise<{ ok: true; duplicate: boolean; signatureId: number } | { ok: false; reason: string }> {
  const version = await loadVersion(db, input.documentVersionId);
  if (!version) return { ok: false, reason: "That document version does not exist." };
  const existing = await db
    .select({ id: salespersonLegalSignatures.id })
    .from(salespersonLegalSignatures)
    .where(and(
      eq(salespersonLegalSignatures.userId, input.userId),
      eq(salespersonLegalSignatures.documentVersionId, version.id),
    ))
    .limit(1);
  if (existing[0]) return { ok: true, duplicate: true, signatureId: existing[0].id };
  if (input.providerEventId) {
    const [byEvent] = await db
      .select({ id: salespersonLegalSignatures.id })
      .from(salespersonLegalSignatures)
      .where(eq(salespersonLegalSignatures.providerEventId, input.providerEventId))
      .limit(1);
    if (byEvent) return { ok: true, duplicate: true, signatureId: byEvent.id };
  }
  const inserted = await db.insert(salespersonLegalSignatures).values({
    userId: input.userId,
    documentId: version.documentId,
    documentVersionId: version.id,
    documentVersion: version.version,
    termYears: version.termYears,
    documentTitle: version.title,
    contentSha256: version.contentSha256,
    provider: "docuseal",
    providerSubmissionId: input.providerSubmissionId || "unknown",
    providerSubmitterId: input.providerSubmitterId,
    providerEventId: input.providerEventId,
    signerName: input.signerName,
    signerEmail: input.signerEmail,
    signedPdfKey: input.signedPdfKey ?? null,
    auditLogKey: input.auditLogKey ?? null,
    completedAt: input.completedAt,
  });
  await db.update(salespersonLegalSigningSessions).set({ status: "completed" }).where(and(
    eq(salespersonLegalSigningSessions.userId, input.userId),
    eq(salespersonLegalSigningSessions.documentVersionId, version.id),
    eq(salespersonLegalSigningSessions.status, "pending"),
  ));
  await refreshVerification(db, input.userId);
  return { ok: true, duplicate: false, signatureId: insertedId(inserted) };
}

export async function markSalespersonSessionStatus(
  db: Database,
  submissionId: string,
  status: "declined" | "expired",
): Promise<void> {
  await db.update(salespersonLegalSigningSessions).set({ status }).where(and(
    eq(salespersonLegalSigningSessions.providerSubmissionId, submissionId),
    eq(salespersonLegalSigningSessions.status, "pending"),
  ));
}

export async function attachSignatureFiles(
  db: Database,
  signatureId: number,
  files: { signedPdfKey?: string | null; auditLogKey?: string | null },
) {
  await db.update(salespersonLegalSignatures).set(files).where(eq(salespersonLegalSignatures.id, signatureId));
}
