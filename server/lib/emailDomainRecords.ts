// Read-only DNS check for the mail records a store's own domain needs. It only
// looks up public DNS TXT/CNAME records. It never connects to a mail server and
// never sends mail. Record names and values come from each provider's docs; see
// docs/affiliate-outbound-email.md ("Domain mailbox setup").

import { promises as dns } from "node:dns";

export type DomainRecordCheck = {
  domain: string;
  /** An SPF TXT record (v=spf1 ...) exists at the domain. */
  spf: boolean;
  /** A DMARC TXT record exists at _dmarc.<domain>. */
  dmarc: boolean;
  /** One of the known DKIM selectors answered. `null` when none did. */
  dkimSelector: string | null;
  /** False when DNS itself could not be reached, so "missing" would be a guess. */
  reliable: boolean;
};

/** Selectors from the Hostinger, Google Workspace, and Microsoft 365 docs. */
export const KNOWN_DKIM_SELECTORS = [
  "hostingermail-a", "hostingermail-b", "hostingermail-c",
  "google",
  "selector1", "selector2",
] as const;

type Resolver = {
  resolveTxt: (name: string) => Promise<string[][]>;
  resolveCname: (name: string) => Promise<string[]>;
};

const NOT_FOUND = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

async function txt(resolver: Resolver, name: string): Promise<{ values: string[]; failed: boolean }> {
  try {
    const rows = await resolver.resolveTxt(name);
    return { values: rows.map((chunks) => chunks.join("")), failed: false };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    return { values: [], failed: !NOT_FOUND.has(code) };
  }
}

async function cname(resolver: Resolver, name: string): Promise<{ found: boolean; failed: boolean }> {
  try {
    return { found: (await resolver.resolveCname(name)).length > 0, failed: false };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    return { found: false, failed: !NOT_FOUND.has(code) };
  }
}

export async function checkMailDomainRecords(
  domain: string,
  resolver: Resolver = dns,
): Promise<DomainRecordCheck> {
  let failed = false;
  const spfLookup = await txt(resolver, domain);
  failed ||= spfLookup.failed;
  const dmarcLookup = await txt(resolver, `_dmarc.${domain}`);
  failed ||= dmarcLookup.failed;

  let dkimSelector: string | null = null;
  for (const selector of KNOWN_DKIM_SELECTORS) {
    const name = `${selector}._domainkey.${domain}`;
    const asTxt = await txt(resolver, name);
    // A CNAME to the host's key also answers a TXT query, but resolveTxt follows
    // it only on some resolvers, so ask for the CNAME as well.
    if (asTxt.values.some((value) => /v=DKIM1/i.test(value))) { dkimSelector = selector; break; }
    const asCname = await cname(resolver, name);
    if (asCname.found) { dkimSelector = selector; break; }
    failed ||= asTxt.failed && asCname.failed;
  }

  return {
    domain,
    spf: spfLookup.values.some((value) => /^v=spf1\b/i.test(value.trim())),
    dmarc: dmarcLookup.values.some((value) => /^v=DMARC1\b/i.test(value.trim())),
    dkimSelector,
    reliable: !failed,
  };
}
