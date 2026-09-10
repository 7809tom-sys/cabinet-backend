export type AffiliateHeadBrand = {
  slug: string;
  storeName?: string | null;
  tagline?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  publicPhone?: string | null;
  publicEmail?: string | null;
  publicAddress?: string | null;
  serviceArea?: string | null;
  pageTitle?: string | null;
  pageDescription?: string | null;
  canonicalUrl?: string | null;
  indexable?: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function usableImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://affiliate.local");
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

function monogramFavicon(storeName: string, primaryColor: string): string {
  const initial = storeName.trim().slice(0, 1).toUpperCase() || "S";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${primaryColor}"/><text x="32" y="43" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#fff">${escapeHtml(initial)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function replaceOrInsertMeta(
  html: string,
  attribute: "name" | "property",
  key: string,
  content: string | null,
): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${escapedKey}["'][^>]*>`, "i");
  if (content == null) return html.replace(pattern, "");
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`;
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace("</head>", `  ${tag}\n</head>`);
}

function replaceOrInsertIcon(html: string, relation: "icon" | "apple-touch-icon", href: string): string {
  const pattern = new RegExp(`<link\\s+rel=["']${relation}["'][^>]*>`, "i");
  const tag = `<link rel="${relation}" href="${escapeHtml(href)}" />`;
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace("</head>", `  ${tag}\n</head>`);
}

function replaceOrInsertLink(html: string, relation: string, href: string | null): string {
  const escapedRelation = relation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<link\\s+rel=["']${escapedRelation}["'][^>]*>`, "i");
  if (href == null) return html.replace(pattern, "");
  const tag = `<link rel="${relation}" href="${escapeHtml(href)}" />`;
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace("</head>", `  ${tag}\n</head>`);
}

function replaceAffiliateSeoJsonLd(html: string, data: Record<string, unknown>[]): string {
  const withoutExisting = html.replace(
    /<script\s+type=["']application\/ld\+json["'][^>]*data-affiliate-seo[^>]*>[\s\S]*?<\/script>\s*/gi,
    "",
  );
  const safeJson = JSON.stringify(data).replace(/</g, "\\u003c");
  return withoutExisting.replace(
    "</head>",
    `  <script type="application/ld+json" data-affiliate-seo="true">${safeJson}</script>\n</head>`,
  );
}

/**
 * Replaces the platform head before a white-label affiliate SPA is delivered.
 * This prevents a pre-JavaScript tab, bookmark, crawler, or share preview from
 * seeing Cabinet Dealz text or imagery while the client retrieves storefront data.
 */
export function injectAffiliateWhiteLabelHead(
  html: string,
  brand: AffiliateHeadBrand,
): string {
  const storeName = brand.storeName?.trim() || "Kitchen & Bath Store";
  const tagline = brand.tagline?.trim() || "Cabinets and kitchen design";
  const title = brand.pageTitle?.trim() || (brand.tagline?.trim() ? `${storeName} — ${tagline}` : storeName);
  const description = brand.pageDescription?.trim() || tagline;
  const imageUrl = usableImageUrl(brand.logoUrl);
  const canonicalUrl = usableImageUrl(brand.canonicalUrl);
  const indexable = brand.indexable !== false;
  const primaryColor = /^#[0-9a-fA-F]{6}$/.test(brand.primaryColor || "")
    ? brand.primaryColor!
    : "#1a2b4a";
  const favicon = imageUrl || monogramFavicon(storeName, primaryColor);

  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  out = replaceOrInsertMeta(out, "name", "description", description);
  out = replaceOrInsertMeta(out, "property", "og:site_name", storeName);
  out = replaceOrInsertMeta(out, "property", "og:title", title);
  out = replaceOrInsertMeta(out, "property", "og:description", description);
  out = replaceOrInsertMeta(out, "name", "twitter:title", title);
  out = replaceOrInsertMeta(out, "name", "twitter:description", description);
  out = replaceOrInsertMeta(out, "property", "og:image", imageUrl);
  out = replaceOrInsertMeta(out, "name", "twitter:image", imageUrl);
  out = replaceOrInsertMeta(out, "property", "og:url", canonicalUrl);
  out = replaceOrInsertMeta(
    out,
    "name",
    "robots",
    indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow",
  );
  out = replaceOrInsertMeta(out, "name", "theme-color", primaryColor);
  out = replaceOrInsertLink(out, "canonical", canonicalUrl);
  out = replaceOrInsertIcon(out, "icon", favicon);
  out = replaceOrInsertIcon(out, "apple-touch-icon", favicon);
  // The shared platform PWA manifest carries the platform name. An affiliate
  // should not install a browser app that exposes Cabinet Dealz branding.
  out = out.replace(/<link\s+rel=["']manifest["'][^>]*>\s*/i, "");
  if (canonicalUrl && indexable) {
    const serviceAreas = (brand.serviceArea || "")
      .split(/[,;\n]/)
      .map((area) => area.trim())
      .filter(Boolean);
    out = replaceAffiliateSeoJsonLd(out, [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: storeName,
        url: canonicalUrl,
        ...(description ? { description } : {}),
        ...(imageUrl ? { logo: imageUrl } : {}),
        ...(brand.publicPhone?.trim() ? { telephone: brand.publicPhone.trim() } : {}),
        ...(brand.publicEmail?.trim() ? { email: brand.publicEmail.trim() } : {}),
        ...(brand.publicAddress?.trim() ? { address: brand.publicAddress.trim() } : {}),
        ...(serviceAreas.length > 0 ? { areaServed: serviceAreas } : {}),
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: storeName,
        url: canonicalUrl,
      },
    ]);
  }
  const slugJson = JSON.stringify(brand.slug).replace(/</g, "\\u003c");
  const routingBootstrap = `<script>window.__AFFILIATE_SLUG__=${slugJson};(function(){var p=window.location.pathname;if(p.indexOf('/store/')===0||p.indexOf('/api/')===0)return;var s=p==='/'?'':p;window.location.replace('/store/'+window.__AFFILIATE_SLUG__+s+window.location.search);})();</script>`;
  return out.replace(
    "<head>",
    `<head>${routingBootstrap}`,
  );
}
