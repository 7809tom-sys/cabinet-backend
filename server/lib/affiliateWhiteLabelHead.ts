import { publicSocialLinks } from "../../shared/affiliateSocialLinks";

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
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  socialLinks?: unknown;
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

function stripAffiliateNoscript(html: string): string {
  return html.replace(/\s*<noscript\s+data-affiliate-seo-noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");
}

/**
 * Gives a verified affiliate storefront meaningful raw HTML without guessing any
 * local claims. It is rendered only for the handful of indexable storefront
 * discovery routes; checkout, cart, and other operational paths remain absent.
 */
function injectAffiliateNoscript(
  html: string,
  input: {
    indexable: boolean;
    storeName: string;
    tagline: string;
    serviceAreas: string[];
    slug: string;
    pageTitle: string;
  },
): string {
  const withoutExisting = stripAffiliateNoscript(html);
  if (!input.indexable) return withoutExisting;

  const basePath = `/store/${encodeURIComponent(input.slug)}`;
  const storeName = escapeHtml(input.storeName);
  const tagline = escapeHtml(input.tagline);
  const serviceSentence = input.serviceAreas.length > 0
    ? `<p>Service area: ${input.serviceAreas.map(escapeHtml).join(", ")}.</p>`
    : "";
  const isKitchenPath = /plan your complete kitchen/i.test(input.pageTitle);
  const isPackagesPath = /kitchen packages/i.test(input.pageTitle);
  const document = isKitchenPath
    ? `<main aria-labelledby="affiliate-crawl-title"><h1 id="affiliate-crawl-title">Plan your complete kitchen with ${storeName}</h1><p>${tagline}</p>${serviceSentence}<p>Choose a kitchen direction, explore a Kitchen Package or layout, then prepare the complete project for a quote discussion.</p><ol><li>Choose a kitchen look.</li><li>Start with a Kitchen Package or layout.</li><li>Bring cabinet, surface, fixture, and delivery decisions together for the project.</li></ol><nav aria-label="Kitchen planning paths"><a href="${basePath}/bundles">Explore Kitchen Packages</a> · <a href="${basePath}/design">Open kitchen designer</a></nav></main>`
    : isPackagesPath
      ? `<main aria-labelledby="affiliate-crawl-title"><h1 id="affiliate-crawl-title">Kitchen Packages with ${storeName}</h1><p>${tagline}</p>${serviceSentence}<p>Explore ready-to-customize complete kitchen package ideas before moving into kitchen planning, design, and quote review.</p><p><a href="${basePath}/kitchens">Plan a complete kitchen</a> · <a href="${basePath}/design">Open kitchen designer</a></p></main>`
      : `<main aria-labelledby="affiliate-crawl-title"><h1 id="affiliate-crawl-title">${storeName}</h1><p>${tagline}</p>${serviceSentence}<p>Explore a complete-kitchen planning path before selecting a cabinet line, layout, surfaces, fixtures, and delivery information.</p><nav aria-label="Storefront discovery"><a href="${basePath}/kitchens">Plan a complete kitchen</a> · <a href="${basePath}/bundles">Explore Kitchen Packages</a></nav></main>`;
  const block = `<noscript data-affiliate-seo-noscript="true">${document}</noscript>`;
  const rootPattern = /(<div\s+id=["']root["'][^>]*><\/div>)/i;
  return rootPattern.test(withoutExisting)
    ? withoutExisting.replace(rootPattern, `$1${block}`)
    : withoutExisting.replace("</body>", `${block}</body>`);
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
  const serviceAreas = (brand.serviceArea || "")
    .split(/[,;\n]/)
    .map((area) => area.trim())
    .filter(Boolean);
  const defaultDescription = serviceAreas.length > 0
    ? `${tagline.replace(/[.]+$/, "")}. Serving ${serviceAreas.join(", ")}.`
    : tagline;
  const description = brand.pageDescription?.trim() || defaultDescription;
  const imageUrl = usableImageUrl(brand.logoUrl);
  const canonicalUrl = usableImageUrl(brand.canonicalUrl);
  const socialProfiles = publicSocialLinks(brand.socialLinks, {
    facebookUrl: brand.facebookUrl,
    instagramUrl: brand.instagramUrl,
  }).map((link) => link.url);
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
        ...(socialProfiles.length > 0 ? { sameAs: socialProfiles } : {}),
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
  const headed = out.replace(
    "<head>",
    `<head>${routingBootstrap}`,
  );
  return injectAffiliateNoscript(headed, {
    indexable,
    storeName,
    tagline,
    serviceAreas,
    slug: brand.slug,
    pageTitle: title,
  });
}
