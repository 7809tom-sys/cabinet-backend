// Which mail domains are consumer mailboxes (no DNS for the owner to manage) and
// which are the owner's own domain. Pure so the server and its tests share it.

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "ymail.com", "rocketmail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "aol.com", "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "gmx.com", "zoho.com",
  "comcast.net", "att.net", "sbcglobal.net", "verizon.net", "cox.net",
]);

export function emailDomain(address: string | null | undefined): string | null {
  const value = (address ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return null;
  const domain = value.slice(at + 1);
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain) ? domain : null;
}

export function isFreeMailDomain(domain: string | null | undefined): boolean {
  return domain != null && FREE_MAIL_DOMAINS.has(domain.toLowerCase());
}

/** The domain an owner must publish mail DNS records for, or null. */
export function ownMailDomain(...addresses: Array<string | null | undefined>): string | null {
  for (const address of addresses) {
    const domain = emailDomain(address);
    if (domain && !isFreeMailDomain(domain)) return domain;
  }
  return null;
}
