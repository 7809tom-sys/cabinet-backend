import type { Express, Request } from "express";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { affiliateSlugFromHostCandidates } from "./lib/affiliateSubdomain";
import { canonicalPublicOrigin } from "./lib/publicOrigin";

/**
 * SEO routes: a crawl-accurate robots.txt and a dynamic sitemap.xml.
 *
 * Both are generated from the *live request host*, so the URLs are always
 * correct no matter which domain the site is published on (a manus.space
 * subdomain or a custom domain) — no hardcoded host to keep in sync.
 *
 * The sitemap lists stable public routes plus every active door-style family
 * (discovered from the DB). Per-SKU product URLs are intentionally omitted:
 * they are reachable via internal links from each family page, and enumerating
 * them would expose exact catalog counts (a deliberate merchandising choice).
 *
 * Static fallbacks exist in client/public, but these dynamic routes take
 * precedence because they are registered before the SPA/static handlers.
 */

// Build the absolute origin (scheme + host) from the incoming request,
// honoring reverse-proxy headers used by the hosting layer.
function originFromRequest(req: Request, affiliateSlug?: string | null): string {
  return canonicalPublicOrigin({
    protocol: req.headers["x-forwarded-proto"] as string | undefined ?? req.protocol,
    hostCandidates: [
      req.headers["x-original-host"],
      req.headers["x-forwarded-host"],
      req.headers["x-host"],
      req.hostname,
      req.headers.host,
    ],
    affiliateSlug,
    production: process.env.NODE_ENV === "production",
  });
}

const STATIC_ROUTES: { path: string; changefreq: string; priority: string }[] =
  [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/styles", changefreq: "weekly", priority: "0.9" },
    { path: "/catalog", changefreq: "weekly", priority: "0.9" },
    { path: "/kitchens", changefreq: "weekly", priority: "0.95" },
    { path: "/bundles", changefreq: "weekly", priority: "0.8" },
    { path: "/surfaces", changefreq: "monthly", priority: "0.8" },
    { path: "/countertops", changefreq: "monthly", priority: "0.7" },
    { path: "/stonecreek", changefreq: "monthly", priority: "0.7" },
    { path: "/plumbers-choice", changefreq: "monthly", priority: "0.7" },
    { path: "/affiliate", changefreq: "monthly", priority: "0.6" },
    { path: "/pro-network", changefreq: "monthly", priority: "0.6" },
  ];

function affiliateSlugForRequest(req: Request): string | null {
  return affiliateSlugFromHostCandidates([
    req.headers["x-original-host"],
    req.headers["x-forwarded-host"],
    req.headers["x-host"],
    req.hostname,
    req.headers.host,
  ]);
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function registerSeoRoutes(app: Express) {
  app.get("/robots.txt", (req, res) => {
    const affiliateSlug = affiliateSlugForRequest(req);
    const origin = originFromRequest(req, affiliateSlug);
    const body = [
      affiliateSlug ? "# Branded storefront crawl policy" : "# Cabinet Dealz crawl policy",
      "User-agent: *",
      "Allow: /",
      "",
      "# Keep transactional / private app areas out of the index",
      "Disallow: /cart",
      "Disallow: /store/*/cart",
      "Disallow: /store/*/order",
      "Disallow: /store/*/design",
      "Disallow: /checkout",
      "Disallow: /signin",
      "Disallow: /sign-in",
      "Disallow: /admin",
      "Disallow: /administration",
      "Disallow: /account",
      "Disallow: /design",
      "Disallow: /order",
      "Disallow: /bulk-order",
      "Disallow: /photo-to-cart",
      "Disallow: /distributor",
      "Disallow: /affiliate-dashboard",
      "Disallow: /api/",
      "",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n");
    res.set("Content-Type", "text/plain; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(body);
  });

  app.get("/sitemap.xml", async (req, res) => {
    const affiliateSlug = affiliateSlugForRequest(req);
    const origin = originFromRequest(req, affiliateSlug);

    if (affiliateSlug) {
      const storefrontPath = `/store/${encodeURIComponent(affiliateSlug)}`;
      const kitchenPath = `${storefrontPath}/kitchens`;
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${xmlEscape(origin + storefrontPath)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>${xmlEscape(origin + kitchenPath)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n</urlset>\n`;
      res.set("Content-Type", "application/xml; charset=utf-8");
      res.set("Cache-Control", "public, max-age=3600");
      return res.send(xml);
    }

    // Collect active door-style family URLs (deduped by styleCode).
    let familyPaths: string[] = [];
    try {
      const db = await getDb();
      const rows = db
        ? await db
        .select({ styleCode: doorStyles.styleCode })
        .from(doorStyles)
        .where(eq(doorStyles.isActive, true))
        : [];
      const seen = new Set<string>();
      for (const r of rows) {
        const code = (r.styleCode || "").trim();
        if (code && !seen.has(code)) {
          seen.add(code);
          familyPaths.push(`/family/${encodeURIComponent(code)}`);
        }
      }
    } catch {
      // If the DB is unavailable, still emit the static routes.
      familyPaths = [];
    }

    const urls: string[] = [];
    for (const r of STATIC_ROUTES) {
      urls.push(
        `  <url>\n    <loc>${xmlEscape(origin + r.path)}</loc>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`,
      );
    }
    for (const p of familyPaths) {
      urls.push(
        `  <url>\n    <loc>${xmlEscape(origin + p)}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`,
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });
}
