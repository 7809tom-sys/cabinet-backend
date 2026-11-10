/**
 * Salesperson Job Boarding: the four-step onboarding gate, the non-compete
 * placeholder, and the W-9 field list.
 *
 * The non-compete body is a placeholder Tom (or his attorney) replaces by
 * publishing a new version. Nothing in this file is contract or certification
 * wording.
 */

export const JOB_BOARDING_STEPS = ["information", "non_compete", "w9", "identity"] as const;
export type JobBoardingStep = (typeof JOB_BOARDING_STEPS)[number];

export const NON_COMPETE_SLUG = "salesperson-non-compete";
export const DEFAULT_NON_COMPETE_TERM_YEARS = 2;
export const NON_COMPETE_TITLE = "Salesperson non-compete";

/** Shown until an admin publishes a replacement version. Not contract wording. */
export const NON_COMPETE_PLACEHOLDER =
  "Two-year non-compete — final text pending from Tom or his attorney";

export const SALESPERSON_IDENTITY_PREFIX = "salesperson-identity/";
export const SALESPERSON_LEGAL_DOCUMENT_PREFIX = "salesperson-legal-documents/";
export const SALESPERSON_LEGAL_SIGNATURE_PREFIX = "salesperson-legal-signatures/";

/** Official IRS Form W-9. The flow links this PDF and does not reproduce its certification. */
export const W9_OFFICIAL_PDF_URL = "https://www.irs.gov/pub/irs-pdf/fw9.pdf";
export const W9_ABOUT_URL = "https://www.irs.gov/forms-pubs/about-form-w-9";
export const W9_PLACEHOLDER_NOTE =
  "W-9 certification wording pending — Tom should confirm the official IRS Form W-9 text. This step collects the form fields and links the official IRS PDF. It does not reproduce certification language.";

export const SALESPERSON_TAX_CLASSIFICATIONS = [
  "individual",
  "c_corporation",
  "s_corporation",
  "partnership",
  "trust_estate",
  "llc",
  "other",
] as const;
export type SalespersonTaxClassification = (typeof SALESPERSON_TAX_CLASSIFICATIONS)[number];

/** Labels of the classification boxes on IRS Form W-9. Not the certification paragraph. */
export const TAX_CLASSIFICATION_LABELS: Record<SalespersonTaxClassification, string> = {
  individual: "Individual / sole proprietor",
  c_corporation: "C corporation",
  s_corporation: "S corporation",
  partnership: "Partnership",
  trust_estate: "Trust / estate",
  llc: "LLC",
  other: "Other",
};

export const IDENTITY_LABELS = ["front", "back", "other"] as const;
export type IdentityLabel = (typeof IDENTITY_LABELS)[number];

export type JobBoardingBlocker = "information" | "non_compete" | "w9" | "identity";

export type JobBoardingProgress = {
  informationComplete: boolean;
  nonCompeteSigned: boolean;
  w9Submitted: boolean;
  identityUploaded: boolean;
};

export function evaluateJobBoarding(progress: JobBoardingProgress): {
  verified: boolean;
  blockers: JobBoardingBlocker[];
} {
  const blockers: JobBoardingBlocker[] = [];
  if (!progress.informationComplete) blockers.push("information");
  if (!progress.nonCompeteSigned) blockers.push("non_compete");
  if (!progress.w9Submitted) blockers.push("w9");
  if (!progress.identityUploaded) blockers.push("identity");
  return { verified: blockers.length === 0, blockers };
}

export function nonCompeteTermLabel(termYears: number): string {
  const years = Number.isInteger(termYears) && termYears > 0 ? termYears : DEFAULT_NON_COMPETE_TERM_YEARS;
  return years === 1 ? "1 year" : `${years} years`;
}

export function isNonCompetePlaceholder(body: string | null | undefined): boolean {
  return (body ?? "").trim() === NON_COMPETE_PLACEHOLDER;
}

export function buildJobBoardingSignerExternalId(input: { userId: number; documentVersionId: number }): string {
  return `cd-job:u${Math.trunc(input.userId)}:v${Math.trunc(input.documentVersionId)}`;
}

export function parseJobBoardingSignerExternalId(value: unknown): { userId: number; documentVersionId: number } | null {
  if (typeof value !== "string") return null;
  const match = /^cd-job:u(\d+):v(\d+)$/.exec(value.trim());
  if (!match) return null;
  const userId = Number(match[1]);
  const documentVersionId = Number(match[2]);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isInteger(documentVersionId) || documentVersionId <= 0) return null;
  return { userId, documentVersionId };
}

export function maskTaxId(last4: string | null | undefined): string | null {
  if (!last4 || !/^\d{4}$/.test(last4)) return null;
  return `***-**-${last4}`;
}

export function normalizeTaxId(
  raw: string,
  type: "ssn" | "ein",
): { ok: true; digits: string; last4: string } | { ok: false; message: string } {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 9) {
    return { ok: false, message: type === "ssn" ? "Enter a 9-digit SSN." : "Enter a 9-digit EIN." };
  }
  return { ok: true, digits, last4: digits.slice(-4) };
}

export type TinView =
  | { ok: false; reason: "forbidden" }
  | { ok: true; masked: string | null; tin: string | null };

/**
 * The salesperson's own screen always gets the mask. The full TIN is returned
 * only to an admin who asked to reveal it. Anyone else is refused.
 */
export function jobBoardingTinView(input: {
  viewerRole: string;
  viewerId: number;
  ownerUserId: number;
  last4: string | null;
  plaintext: string | null;
  reveal: boolean;
}): TinView {
  const admin = input.viewerRole === "admin";
  const self = input.viewerId === input.ownerUserId;
  if (!admin && !self) return { ok: false, reason: "forbidden" };
  if (input.reveal && !admin) return { ok: false, reason: "forbidden" };
  return {
    ok: true,
    masked: maskTaxId(input.last4),
    tin: input.reveal ? input.plaintext : null,
  };
}

/** A government-ID row the UI may render. The storage key is never included. */
export function identityFileView(row: {
  id: number;
  label: string;
  originalName: string | null;
  mimeType: string;
  createdAt: Date | string;
}): { id: number; label: string; originalName: string | null; mimeType: string; uploadedAt: Date | string } {
  return {
    id: row.id,
    label: row.label,
    originalName: row.originalName,
    mimeType: row.mimeType,
    uploadedAt: row.createdAt,
  };
}

export function salespersonEDocPath(userId: number): string {
  return `/job-boarding/review/${userId}`;
}

export function salespersonVerificationPath(token: string): string {
  return `/job-boarding/verify/${token}`;
}

export function jobBoardingBlockerMessage(blocker: JobBoardingBlocker): string {
  switch (blocker) {
    case "information":
      return "Enter your contact information.";
    case "non_compete":
      return "Sign the current non-compete.";
    case "w9":
      return "Submit the W-9.";
    case "identity":
      return "Upload a government ID.";
  }
}
