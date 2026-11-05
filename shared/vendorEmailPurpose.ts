// Per-vendor contact addresses by purpose, and how an inbound message is
// matched back to a vendor and a purpose.
//
// Each supplier (for example US Cabinet Depot) has four addresses it publishes:
// claims, support, sales, and sales communication. When one of those addresses
// receives mail, the platform tags the message with the vendor and the purpose
// so it can be routed to the right internal inbox.
//
// Pure so it can be unit-tested and reused by the webhook, the router, and an
// admin screen. No database, network, or secret material here.

export const VENDOR_EMAIL_PURPOSES = [
  "claims",
  "support",
  "sales",
  "sales_communication",
] as const;

export type VendorEmailPurpose = (typeof VENDOR_EMAIL_PURPOSES)[number];

export const VENDOR_EMAIL_PURPOSE_LABELS: Record<VendorEmailPurpose, string> = {
  claims: "Claims",
  support: "Support",
  sales: "Sales",
  sales_communication: "Sales communication",
};

export const VENDOR_EMAIL_PURPOSE_HINTS: Record<VendorEmailPurpose, string> = {
  claims: "Where the vendor wants damage and shortage claims sent.",
  support: "Where the vendor wants product and order support requests sent.",
  sales: "Where the vendor wants new sales enquiries sent.",
  sales_communication: "Where the vendor wants ongoing sales correspondence sent.",
};

export function isVendorEmailPurpose(value: unknown): value is VendorEmailPurpose {
  return typeof value === "string" && (VENDOR_EMAIL_PURPOSES as readonly string[]).includes(value);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed address, or null when it is not a usable email. */
export function normalizeEmailAddress(value: string | null | undefined): string | null {
  const email = (value ?? "").trim().toLowerCase();
  if (!email || email.length > 320) return null;
  return EMAIL_PATTERN.test(email) ? email : null;
}

/**
 * The bare address out of a header such as `"UCD Claims" <claims@ucd.test>`.
 * Anything unparseable is returned trimmed and lowercased so a match can still
 * be attempted rather than silently dropped.
 */
export function bareAddress(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const angled = raw.match(/<([^>]*)>/);
  const candidate = angled ? angled[1] : raw;
  return normalizeEmailAddress(candidate) ?? (candidate.trim().toLowerCase() || null);
}

export type VendorAddressRow = {
  distributorId: number;
  purpose: VendorEmailPurpose;
  address: string;
};

export type InboundMatch = {
  distributorId: number;
  purpose: VendorEmailPurpose;
};

/**
 * Finds the vendor and purpose for a recipient address.
 *
 * Every configured address for the recipient is considered. An exact address
 * match wins; a vendor and purpose are only reported when the address maps to
 * exactly one of them, so a shared inbox never gets tagged with a guess.
 */
export function matchInboundRecipient(
  toAddresses: readonly (string | null | undefined)[],
  rows: readonly VendorAddressRow[],
): InboundMatch | null {
  const wanted = new Set<string>();
  for (const value of toAddresses) {
    const address = bareAddress(value);
    if (address) wanted.add(address);
  }
  if (wanted.size === 0) return null;
  const hits = rows.filter((row) => {
    const configured = bareAddress(row.address);
    return configured != null && wanted.has(configured);
  });
  if (hits.length === 0) return null;
  const distributorIds = new Set(hits.map((hit) => hit.distributorId));
  const purposes = new Set(hits.map((hit) => hit.purpose));
  if (distributorIds.size !== 1 || purposes.size !== 1) return null;
  return { distributorId: hits[0].distributorId, purpose: hits[0].purpose };
}

/**
 * Purpose implied by the local part of an address, used only when a vendor has
 * not configured a distinct address per purpose. "claims@", "support@",
 * "sales@" are recognized; "salescomm@" and similar read as sales
 * communication. Null when nothing is implied.
 */
export function purposeFromAddressHint(address: string | null | undefined): VendorEmailPurpose | null {
  const bare = bareAddress(address);
  if (!bare) return null;
  const local = bare.split("@")[0] ?? "";
  const compact = local.replace(/[^a-z]/g, "");
  if (!compact) return null;
  if (compact.includes("claim")) return "claims";
  if (compact.includes("support") || compact.includes("service")) return "support";
  if (compact.includes("salescomm") || compact.includes("salescommunication")) return "sales_communication";
  if (compact.includes("sales")) return "sales";
  return null;
}

/**
 * Header names worth keeping from an inbound message. Provider webhooks nest
 * headers differently, so lookups are case-insensitive and accept the shapes
 * Resend/Postmark style payloads use.
 */
export function headerValue(headers: unknown, name: string): string | null {
  const target = name.toLowerCase();
  if (headers == null) return null;
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (entry == null || typeof entry !== "object") continue;
      const record = entry as { name?: unknown; key?: unknown; value?: unknown };
      const key = String(record.name ?? record.key ?? "").toLowerCase();
      if (key === target && record.value != null) return String(record.value).trim() || null;
    }
    return null;
  }
  if (typeof headers === "object") {
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      if (key.toLowerCase() !== target) continue;
      if (Array.isArray(value)) return value.map((part) => String(part)).join(", ").trim() || null;
      return value == null ? null : String(value).trim() || null;
    }
  }
  return null;
}

/** Splits a To/Cc header or array of addresses into usable bare addresses. */
export function recipientAddresses(value: unknown): string[] {
  const parts: string[] = [];
  const push = (item: unknown) => {
    if (item == null) return;
    if (Array.isArray(item)) {
      for (const nested of item) push(nested);
      return;
    }
    const textValue = typeof item === "string" ? item : String(item);
    for (const piece of textValue.split(/[,;]+/)) {
      const address = bareAddress(piece);
      if (address) parts.push(address);
    }
  };
  push(value);
  return Array.from(new Set(parts));
}
