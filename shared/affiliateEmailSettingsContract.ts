// The affiliate email-settings contract the frontend already calls.
//
// cabinet-frontend PR 232 ships `affiliateEmailSettings.get / update / sendTest`
// with the field names below (see its
// `client/src/lib/affiliateEmailSettingsProcedures.ts` and
// `shared/affiliateEmailSettings.ts`). The backend's native surface is
// `crm.emailSetup.*`; this module is the pure translation layer between the two
// so the dashboard works with no frontend edit.
//
// Naming map (frontend -> native):
//   email          -> contactEmail
//   secure         -> smtpSecure
//   username       -> smtpUser
//   appPassword    -> smtpPass   (write-only: stored encrypted, returned never)
//   hasAppPassword -> hasPassword
//
// There is deliberately no invoice-copy field here: the frontend contract fixes
// that copy as "built into invoicing and cannot be turned off", so the native
// value (blank -> Cabinet Dealz admin address) is preserved rather than exposed.

export const AFFILIATE_EMAIL_SETTINGS_PROVIDERS = ["yahoo", "gmail", "outlook", "custom"] as const;
export type AffiliateEmailSettingsProvider = (typeof AFFILIATE_EMAIL_SETTINGS_PROVIDERS)[number];

/** The provider presets the frontend offers. Port and TLS come from the preset. */
export const AFFILIATE_EMAIL_SETTINGS_PRESETS: Record<
  AffiliateEmailSettingsProvider,
  { label: string; host: string; port: number; secure: boolean }
> = {
  yahoo: { label: "Yahoo", host: "smtp.mail.yahoo.com", port: 465, secure: true },
  gmail: { label: "Gmail", host: "smtp.gmail.com", port: 465, secure: true },
  outlook: { label: "Outlook", host: "smtp-mail.outlook.com", port: 587, secure: false },
  custom: { label: "Custom", host: "", port: 587, secure: false },
};

/** What `affiliateEmailSettings.get` and `.update` return. No password, ever. */
export type AffiliateEmailSettingsView = {
  affiliateId: number;
  email: string;
  provider: AffiliateEmailSettingsProvider;
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  username: string;
  enabled: boolean;
  hasAppPassword: boolean;
  configured: boolean;
  canEdit: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
};

/** The exact payload `affiliateEmailSettings.update` accepts. */
export type AffiliateEmailSettingsUpdateInput = {
  affiliateId: number;
  email: string;
  provider: AffiliateEmailSettingsProvider;
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  username: string;
  enabled: boolean;
  /** Omitted when the owner leaves the field blank to keep the saved password. */
  appPassword?: string;
};

export type AffiliateEmailSettingsTestResult = {
  ok: boolean;
  /** Address the test went to. Empty when nothing was configured to send from. */
  to: string;
  /** The provider's exact error text when `ok` is false. */
  error: string | null;
};

/** The native row shape this module reads. Field names match the backend. */
export type AffiliateEmailSettingsNativeRow = {
  affiliateId: number;
  provider: string;
  contactEmail?: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecure?: boolean | null;
  smtpUser: string;
  smtpPass: string;
  smtpFrom?: string | null;
  enabled: boolean;
  lastTestedAt?: Date | string | null;
  lastTestOk?: boolean | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function toAffiliateEmailSettingsProvider(value: string | null | undefined): AffiliateEmailSettingsProvider {
  const provider = clean(value).toLowerCase();
  return (AFFILIATE_EMAIL_SETTINGS_PROVIDERS as readonly string[]).includes(provider)
    ? (provider as AffiliateEmailSettingsProvider)
    : "custom";
}

/** 465 is implicit TLS; any other port speaks STARTTLS unless the row says otherwise. */
export function affiliateEmailSettingsSecure(port: number, secure: boolean | null | undefined): boolean {
  if (secure != null) return Boolean(secure);
  return Number(port) === 465;
}

/** Google shows app passwords with spaces; mail servers want them without. */
export function normalizeAppPassword(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "");
}

/**
 * True when the row has everything the SMTP handshake needs. Mirrors the
 * backend's own readiness check so `configured` and the send path cannot differ.
 */
export function affiliateEmailSettingsConfigured(row: AffiliateEmailSettingsNativeRow | null | undefined): boolean {
  if (!row) return false;
  return Boolean(
    clean(row.contactEmail) || clean(row.smtpFrom) || clean(row.smtpUser),
  ) && Boolean(clean(row.smtpHost))
    && Boolean(clean(row.smtpUser))
    && clean(row.smtpPass).length > 0;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return String(value);
}

/** Client-safe projection: the stored password becomes `hasAppPassword`. */
export function toAffiliateEmailSettingsView(
  row: AffiliateEmailSettingsNativeRow | null | undefined,
  options: { affiliateId: number; canEdit: boolean },
): AffiliateEmailSettingsView {
  return {
    affiliateId: options.affiliateId,
    email: clean(row?.contactEmail) || clean(row?.smtpFrom) || clean(row?.smtpUser),
    provider: toAffiliateEmailSettingsProvider(row?.provider),
    smtpHost: clean(row?.smtpHost),
    smtpPort: Number(row?.smtpPort ?? 587),
    secure: affiliateEmailSettingsSecure(Number(row?.smtpPort ?? 587), row?.smtpSecure),
    username: clean(row?.smtpUser),
    enabled: Boolean(row?.enabled),
    hasAppPassword: clean(row?.smtpPass).length > 0,
    configured: affiliateEmailSettingsConfigured(row),
    canEdit: options.canEdit,
    lastTestedAt: toIsoString(row?.lastTestedAt),
    lastTestOk: row?.lastTestOk ?? null,
  };
}

/** Presets pin the TLS mode, so a preset save cannot disagree with its port. */
export function secureForProvider(provider: AffiliateEmailSettingsProvider, secure: boolean): boolean {
  return provider === "custom" ? secure : AFFILIATE_EMAIL_SETTINGS_PRESETS[provider].secure;
}

/** The native column values one contract update writes. `smtpPass` is supplied by the caller. */
export function toNativeSenderColumns(input: AffiliateEmailSettingsUpdateInput): {
  provider: AffiliateEmailSettingsProvider;
  contactEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  enabled: boolean;
} {
  const provider = toAffiliateEmailSettingsProvider(input.provider);
  return {
    provider,
    contactEmail: clean(input.email),
    smtpHost: clean(input.smtpHost),
    smtpPort: Number(input.smtpPort),
    smtpSecure: secureForProvider(provider, input.secure),
    smtpUser: clean(input.username),
    enabled: Boolean(input.enabled),
  };
}
