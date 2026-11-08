/**
 * Affiliate legal contracts and their e-signature records.
 *
 * Cabinetdealz affiliate membership requires signed contracts (the affiliate
 * agreement, the non-compete, and any addendum an admin publishes). This module
 * holds the parts both the server and a future admin/portal page must agree on:
 * storage prefixes, the DocuSeal signer tag, the document signing status, and
 * the onboarding gate.
 *
 * Signing itself is delegated to DocuSeal (embedded signing). Nothing here
 * talks to the network; the provider lives in server/lib/docuseal.ts behind the
 * EsignatureProvider interface, so a different hosted provider can replace
 * DocuSeal without changing the tables or the gate.
 */

export const LEGAL_DOCUMENT_KINDS = ["markdown", "pdf"] as const;
export type LegalDocumentKind = (typeof LEGAL_DOCUMENT_KINDS)[number];

/**
 * Admin-uploaded contract PDFs live in the private Supabase bucket. The public
 * storage proxy refuses both prefixes, so a contract or a signed copy has no
 * public address even if the key leaks.
 */
export const LEGAL_DOCUMENT_FILE_PREFIX = "affiliate-legal-documents/";
export const LEGAL_SIGNATURE_FILE_PREFIX = "affiliate-legal-signatures/";

/** Provider recorded on every signature row. DocuSeal today, another provider later. */
export const LEGAL_SIGNATURE_PROVIDERS = ["docuseal"] as const;
export type LegalSignatureProvider = (typeof LEGAL_SIGNATURE_PROVIDERS)[number];

/** The exact sentence the portal must show above the embedded signing frame. */
export const LEGAL_SIGNING_CONSENT_TEXT =
  "I agree to sign this contract electronically. I understand my electronic signature is legally binding under the federal ESIGN Act and my state's UETA, and that I can request a paper copy at any time.";

/**
 * DocuSeal submits an opaque `external_id` back on its webhooks. Encoding the
 * affiliate and the document version in it means a webhook can be attributed
 * without trusting anything else in the payload, and without a table lookup.
 */
export function buildLegalSignerExternalId(input: { affiliateId: number; documentVersionId: number }): string {
  return `cd-legal:a${Math.trunc(input.affiliateId)}:v${Math.trunc(input.documentVersionId)}`;
}

export function parseLegalSignerExternalId(value: unknown): { affiliateId: number; documentVersionId: number } | null {
  if (typeof value !== "string") return null;
  const match = /^cd-legal:a(\d+):v(\d+)$/.exec(value.trim());
  if (!match) return null;
  const affiliateId = Number(match[1]);
  const documentVersionId = Number(match[2]);
  if (!Number.isInteger(affiliateId) || affiliateId <= 0) return null;
  if (!Number.isInteger(documentVersionId) || documentVersionId <= 0) return null;
  return { affiliateId, documentVersionId };
}

/**
 * Typed names are compared, never trusted as an identity: DocuSeal owns the
 * signature. The comparison is only used to show an admin that the name typed
 * on the contract matches the name on the affiliate's tax record.
 */
export function normalizeSignerName(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function signerNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeSignerName(a).toLowerCase();
  const right = normalizeSignerName(b).toLowerCase();
  return left.length > 0 && left === right;
}

/** Where a contract stands for one affiliate. */
export type LegalDocumentSigningStatus =
  | "not_required" // active document the affiliate does not have to sign
  | "unpublished" // no current version yet, so nothing can be signed
  | "unsigned"
  | "in_progress"
  | "signed"
  | "declined";

export type LegalSigningSessionStatus = "pending" | "completed" | "declined" | "expired";

/** One row of the gate: a document, its current version, and this affiliate's state. */
export type LegalDocumentGateRow = {
  documentId: number;
  slug: string;
  title: string;
  isActive: boolean;
  requiredForMembership: boolean;
  currentVersionId: number | null;
  currentVersionNumber: number | null;
  signedAt: Date | string | null;
  sessionStatus: LegalSigningSessionStatus | null;
};

export type LegalDocumentGateEntry = {
  documentId: number;
  slug: string;
  title: string;
  required: boolean;
  currentVersionId: number | null;
  currentVersionNumber: number | null;
  status: LegalDocumentSigningStatus;
  signedAt: string | null;
};

export type LegalDocumentGate = {
  /** True only when every required, published contract is signed. */
  signedAll: boolean;
  /**
   * How many active, required, published contracts exist. Zero means an admin
   * has not configured the legal feature yet, which is not the same statement as
   * "this affiliate signed everything". A caller that publishes something
   * irreversible should require this to be greater than zero as well.
   */
  requiredCount: number;
  /** Required contracts still to sign, including one in progress. */
  pending: LegalDocumentGateEntry[];
  /** Required contracts with no current version; the gate cannot pass until an admin publishes. */
  unpublished: LegalDocumentGateEntry[];
  documents: LegalDocumentGateEntry[];
};

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The single decision the onboarding gate makes. Inactive documents never
 * block, and a required document with no current version is reported as
 * unpublished rather than silently passing or silently blocking forever.
 */
export function legalDocumentGate(rows: LegalDocumentGateRow[]): LegalDocumentGate {
  const documents: LegalDocumentGateEntry[] = rows.map((row) => {
    const required = row.isActive && row.requiredForMembership;
    let status: LegalDocumentSigningStatus;
    if (row.signedAt) status = "signed";
    else if (!row.isActive) status = "not_required";
    else if (!required) status = "not_required";
    else if (row.currentVersionId == null) status = "unpublished";
    else if (row.sessionStatus === "declined" || row.sessionStatus === "expired") status = "declined";
    else if (row.sessionStatus === "pending") status = "in_progress";
    else status = "unsigned";
    return {
      documentId: row.documentId,
      slug: row.slug,
      title: row.title,
      required,
      currentVersionId: row.currentVersionId,
      currentVersionNumber: row.currentVersionNumber,
      status,
      signedAt: toIso(row.signedAt),
    };
  });

  const pending = documents.filter((entry) => entry.required && entry.status !== "signed" && entry.status !== "unpublished");
  const unpublished = documents.filter((entry) => entry.required && entry.status === "unpublished");
  const requiredCount = documents.filter(
    (entry) => entry.required && entry.status !== "unpublished",
  ).length;
  return { signedAll: pending.length === 0 && unpublished.length === 0, requiredCount, pending, unpublished, documents };
}

/** What the affiliate portal shows for one contract. */
export type LegalDocumentPortalEntry = LegalDocumentGateEntry & {
  summary: string | null;
  kind: LegalDocumentKind | null;
  versionTitle: string | null;
  signatureId: number | null;
  signingReady: boolean;
};

export function canStartSigning(input: {
  isActive: boolean;
  requiredForMembership: boolean;
  currentVersionId: number | null;
  alreadySigned: boolean;
  templateId: number | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.isActive) return { ok: false, reason: "This document is not available." };
  if (input.currentVersionId == null) return { ok: false, reason: "This document has no published version yet." };
  if (input.alreadySigned) return { ok: false, reason: "You have already signed this version." };
  if (input.templateId == null) {
    return { ok: false, reason: "This contract is not ready for signing yet. Contact Cabinet Dealz support." };
  }
  return { ok: true };
}
