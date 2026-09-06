import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_HTML_CHARS = 800_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export type ImportedWebsiteTestimonial = {
  quote: string;
  author: string | null;
  sourceUrl: string;
};

export type AffiliateWebsiteImportDraft = {
  sourceUrl: string;
  storeName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  publicAddress: string | null;
  aboutText: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  testimonials: ImportedWebsiteTestimonial[];
};

function isPrivateIp(address: string): boolean {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function cleanImportedWebsiteText(value: string | null | undefined, maximum = 4_000): string | null {
  if (!value) return null;
  const cleaned = decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, maximum).trim() : null;
}

function absoluteUrl(value: string | null | undefined, sourceUrl: string): string | null {
  if (!value) return null;
  try {
    const resolved = new URL(decodeEntities(value.trim()), sourceUrl);
    return resolved.protocol === "https:" || resolved.protocol === "http:" ? resolved.toString() : null;
  } catch {
    return null;
  }
}

function attrValue(tag: string, attribute: string): string | null {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function metaValue(html: string, keys: string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attrValue(tag, "name") ?? attrValue(tag, "property") ?? "").toLowerCase();
    if (keys.includes(key)) return attrValue(tag, "content");
  }
  return null;
}

function firstTagText(html: string, tagName: string): string | null {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return cleanImportedWebsiteText(match?.[1] ?? null, 1_000);
}

function normalizePhone(value: string): string | null {
  const compact = value.replace(/\s+/g, " ").trim();
  const digits = compact.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? compact.slice(0, 32) : null;
}

function findSocialLink(html: string, network: "facebook" | "instagram", sourceUrl: string): string | null {
  const regex = new RegExp(`<a\\b[^>]+href\\s*=\\s*(?:"([^"]*${network}[^\"]*)"|'([^']*${network}[^']*)'|([^\\s>]*${network}[^\\s>]*))[^>]*>`, "i");
  const match = html.match(regex);
  return absoluteUrl(match?.[1] ?? match?.[2] ?? match?.[3] ?? null, sourceUrl);
}

function parseJsonLd(html: string): unknown[] {
  const entries: unknown[] = [];
  for (const match of Array.from(html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))) {
    try {
      entries.push(JSON.parse(match[1]));
    } catch {
      // Ignore malformed publisher markup; imported content remains a draft.
    }
  }
  return entries;
}

function collectJsonNodes(value: unknown, destination: Record<string, unknown>[]) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectJsonNodes(entry, destination));
  } else if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    destination.push(item);
    Object.values(item).forEach((entry) => collectJsonNodes(entry, destination));
  }
}

function testimonialsFromJsonLd(html: string, sourceUrl: string): ImportedWebsiteTestimonial[] {
  const nodes: Record<string, unknown>[] = [];
  parseJsonLd(html).forEach((entry) => collectJsonNodes(entry, nodes));
  return nodes.flatMap((node) => {
    const quote = cleanImportedWebsiteText(typeof node.reviewBody === "string" ? node.reviewBody : typeof node.description === "string" && /review/i.test(String(node["@type"] ?? "")) ? node.description : null, 1_000);
    if (!quote || quote.length < 12) return [];
    const rawAuthor = node.author;
    const author = cleanImportedWebsiteText(typeof rawAuthor === "string" ? rawAuthor : rawAuthor && typeof rawAuthor === "object" && typeof (rawAuthor as Record<string, unknown>).name === "string" ? (rawAuthor as Record<string, unknown>).name as string : null, 160);
    return [{ quote, author, sourceUrl }];
  });
}

function testimonialsFromMarkup(html: string, sourceUrl: string): ImportedWebsiteTestimonial[] {
  const testimonials: ImportedWebsiteTestimonial[] = [];
  for (const match of Array.from(html.matchAll(/<(?:blockquote|article|section|div)\b[^>]*(?:testimonial|review)[^>]*>([\s\S]{0,3000}?)<\/(?:blockquote|article|section|div)>/gi))) {
    const quote = cleanImportedWebsiteText(match[1], 1_000);
    if (!quote || quote.length < 12) continue;
    const authorMatch = match[1].match(/<(?:cite|footer|span|p)\b[^>]*(?:author|name|customer)[^>]*>([\s\S]*?)<\/(?:cite|footer|span|p)>/i);
    testimonials.push({ quote, author: cleanImportedWebsiteText(authorMatch?.[1] ?? null, 160), sourceUrl });
  }
  return testimonials;
}

function dedupeTestimonials(candidates: ImportedWebsiteTestimonial[]): ImportedWebsiteTestimonial[] {
  const seen = new Set<string>();
  return candidates.filter((item) => {
    const key = item.quote.toLowerCase().replace(/\W/g, "");
    if (key.length < 12 || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

export function normalizeAffiliateWebsiteUrl(rawUrl: string): string {
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  const url = new URL(withProtocol);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Use a public http or https website URL.");
  if (url.username || url.password || url.port) throw new Error("Use a public website URL without credentials or a custom port.");
  if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".local") || isIP(url.hostname)) throw new Error("Use a public website domain, not a private network address.");
  url.hash = "";
  return url.toString();
}

export async function assertPublicAffiliateWebsiteHost(hostname: string): Promise<void> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("That website does not resolve to a public address.");
  }
}

export function extractAffiliateWebsiteDraft(html: string, sourceUrl: string): AffiliateWebsiteImportDraft {
  const source = normalizeAffiliateWebsiteUrl(sourceUrl);
  const jsonNodes: Record<string, unknown>[] = [];
  parseJsonLd(html).forEach((entry) => collectJsonNodes(entry, jsonNodes));
  const organization = jsonNodes.find((node) => /organization|localbusiness|homeandconstructionbusiness/i.test(String(node["@type"] ?? ""))) ?? {};
  const address = organization.address && typeof organization.address === "object"
    ? cleanImportedWebsiteText(Object.values(organization.address as Record<string, unknown>).filter((value) => typeof value === "string").join(", "), 256)
    : null;
  const rawText = cleanImportedWebsiteText(html, MAX_HTML_CHARS) ?? "";
  const organizationEmail = typeof organization.email === "string" ? organization.email : null;
  const organizationPhone = typeof organization.telephone === "string" ? organization.telephone : null;
  const email = (metaValue(html, ["email", "contact:email"]) ?? organizationEmail ?? rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null)?.slice(0, 320) ?? null;
  const phone = normalizePhone(metaValue(html, ["telephone", "phone", "contact:phone"]) ?? organizationPhone ?? rawText.match(/(?:\+?1[ .-]?)?(?:\(?\d{3}\)?[ .-]?)?\d{3}[ .-]\d{4}/)?.[0] ?? "");
  const logoCandidate = typeof organization.logo === "string"
    ? organization.logo
    : organization.logo && typeof organization.logo === "object" && typeof (organization.logo as Record<string, unknown>).url === "string"
      ? (organization.logo as Record<string, unknown>).url as string
      : metaValue(html, ["og:image", "twitter:image"]);
  const firstParagraph = firstTagText(html, "p");
  const name = cleanImportedWebsiteText(
    metaValue(html, ["og:site_name", "application-name"]) ?? (typeof organization.name === "string" ? organization.name : null) ?? firstTagText(html, "h1") ?? firstTagText(html, "title"),
    256,
  );
  return {
    sourceUrl: source,
    storeName: name,
    logoUrl: absoluteUrl(logoCandidate, source),
    primaryColor: (metaValue(html, ["theme-color"]) ?? null)?.match(/^#[0-9a-f]{3,8}$/i)?.[0] ?? null,
    publicEmail: email,
    publicPhone: phone,
    publicAddress: address,
    aboutText: cleanImportedWebsiteText(metaValue(html, ["description", "og:description"]) ?? firstParagraph, 4_000),
    facebookUrl: findSocialLink(html, "facebook", source),
    instagramUrl: findSocialLink(html, "instagram", source),
    testimonials: dedupeTestimonials([
      ...testimonialsFromJsonLd(html, source),
      ...testimonialsFromMarkup(html, source),
    ]),
  };
}

export async function importAffiliateWebsiteDraft(rawUrl: string): Promise<AffiliateWebsiteImportDraft> {
  let url = normalizeAffiliateWebsiteUrl(rawUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const parsed = new URL(url);
    await assertPublicAffiliateWebsiteHost(parsed.hostname);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "user-agent": "CabinetDealz-Affiliate-Brand-Import/1.0", accept: "text/html,application/xhtml+xml" },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = new URL(response.headers.get("location")!, url).toString();
      continue;
    }
    if (!response.ok) throw new Error(`The website returned ${response.status}.`);
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("That URL did not return a public HTML webpage.");
    return extractAffiliateWebsiteDraft((await response.text()).slice(0, MAX_HTML_CHARS), url);
  }
  throw new Error("The website redirected too many times.");
}
