/**
 * Which countertop quote requests are junk.
 *
 * Two of these rules come straight from the hand-run review script
 * (notes/sql/admin_test_rows_READ_ONLY_part0_part1.sql, P2/D1): a fake-value email
 * domain, or the note the countertop vitest writes.
 *
 * The address rule is the owner's: a countertop quote is only actionable when the
 * fabrication shop can deliver to a real address. The quote form now collects one
 * and the server requires it, so an address only goes missing on a row that
 * bypassed the form. Quotes created before the field existed are exempt by date,
 * because a missing address there means "not collected yet", not "junk".
 *
 * The admin Quote Requests tab uses this to decide whether a row may be deleted,
 * and the delete mutation re-runs it. A row that matches nothing is not deletable.
 * If these rules change, the review script has to change with them.
 */

export const TEST_QUOTE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "example.com",
  "example.org",
  "example.net",
  "example.edu",
  "example.invalid",
  "test.com",
  "mailinator.com",
  "guerrillamail.com",
  "yopmail.com",
  "tempmail.com",
  "trashmail.com",
  "10minutemail.com",
  "sharklasers.com",
  "discard.email",
  "fakeinbox.com",
  "mailnull.com",
  "cabinetdealz.test",
]);

const RESERVED_EMAIL_SUFFIXES = [".test", ".invalid", ".example", ".localhost"] as const;

/** The note server/design.countertop.test.ts leaves behind. */
export const VITEST_COUNTERTOP_NOTE = "vitest countertop request";

export type CountertopQuoteJunkReason =
  | "test_email_domain"
  | "test_note"
  | "incomplete_address";

export const COUNTERTOP_QUOTE_JUNK_LABELS: Record<CountertopQuoteJunkReason, string> = {
  test_email_domain: "test email domain",
  test_note: "test note",
  incomplete_address: "no job site address",
};

/**
 * Quotes created before the homeowner address shipped never had the field, so they
 * are exempt: a missing address there means "not collected yet", not "junk".
 * Only submissions from this point on are held to the rule. Move this constant if
 * the release lands on a different day.
 */
export const JOB_SITE_ADDRESS_REQUIRED_SINCE = new Date("2026-11-26T00:00:00.000Z");

export function isTestQuoteEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  const at = normalized.lastIndexOf("@");
  const domain = at >= 0 ? normalized.slice(at + 1) : normalized;
  if (!domain) return false;
  if (TEST_QUOTE_EMAIL_DOMAINS.has(domain)) return true;
  return RESERVED_EMAIL_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

/**
 * A stored homeowner (job site) address only counts when it reads like
 * "12 Main St, Waukesha, WI 53186" (line2 adds a fourth comma part).
 */
export function isCompleteJobSiteAddress(value: string | null | undefined): boolean {
  const text = (value ?? "").trim();
  if (!text) return false;
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return false;
  // A deliverable street line starts with a house number: "12 Main St", not "Main St".
  if (!/^\d+/.test(parts[0]) || parts[0].length < 6) return false;
  return /^[A-Za-z]{2}\s+\d{5}(-\d{4})?$/.test(parts[parts.length - 1]);
}

function jobSiteAddressReason(quote: {
  jobSiteAddress?: string | null;
  createdAt?: Date | string | null;
}): CountertopQuoteJunkReason | null {
  const created = quote.createdAt ? new Date(quote.createdAt) : null;
  // Unknown or pre-migration age: never guess. Those rows predate the field.
  if (!created || Number.isNaN(created.getTime())) return null;
  if (created.getTime() < JOB_SITE_ADDRESS_REQUIRED_SINCE.getTime()) return null;
  return isCompleteJobSiteAddress(quote.jobSiteAddress) ? null : "incomplete_address";
}

/**
 * The first reason this quote looks like junk, or null when nothing matches.
 * Order is deliberate: a test email is proof, a missing address is only a hint.
 */
export function getCountertopQuoteJunkReason(quote: {
  contactEmail?: string | null;
  notes?: string | null;
  jobSiteAddress?: string | null;
  createdAt?: Date | string | null;
}): CountertopQuoteJunkReason | null {
  if (isTestQuoteEmail(quote.contactEmail)) return "test_email_domain";
  if ((quote.notes ?? "").trim() === VITEST_COUNTERTOP_NOTE) return "test_note";
  return jobSiteAddressReason(quote);
}

export function isJunkCountertopQuote(quote: {
  contactEmail?: string | null;
  notes?: string | null;
  jobSiteAddress?: string | null;
  createdAt?: Date | string | null;
}): boolean {
  return getCountertopQuoteJunkReason(quote) !== null;
}

/**
 * Human label for a reason that arrived over the wire, where the value is not
 * typed. Falls back to "junk" rather than throwing on an unexpected value.
 */
export function countertopQuoteJunkLabel(reason: unknown): string {
  if (typeof reason === "string" && Object.prototype.hasOwnProperty.call(COUNTERTOP_QUOTE_JUNK_LABELS, reason)) {
    return COUNTERTOP_QUOTE_JUNK_LABELS[reason as CountertopQuoteJunkReason];
  }
  return "junk";
}
