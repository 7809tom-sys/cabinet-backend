import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { affiliates } from "../../drizzle/schema";
import { injectAffiliateWhiteLabelHead } from "../lib/affiliateWhiteLabelHead";
import { publicContactForStorefront } from "@shared/affiliateStorefrontControls";
import { injectMainSeoHead } from "../lib/mainSeoHead";
import { injectSharedRoomPreviewHead } from "../sharedRoomPreview";
import { canonicalPublicOrigin } from "../lib/publicOrigin";

function affiliateSlugFromRequestPath(requestPath: string): string | null {
  const slugMatch = requestPath.match(/^\/store\/([^/?#]+)/);
  return slugMatch?.[1] ?? null;
}

function publicOrigin(req: express.Request, affiliateSlug?: string | null): string {
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

function isIndexableAffiliatePath(requestPath: string, slug: string): boolean {
  const pathname = requestPath.split("?")[0].replace(/\/+$/, "") || "/";
  return pathname === `/store/${slug}` || pathname === `/store/${slug}/kitchens` || pathname === `/store/${slug}/bundles`;
}

export async function whiteLabelAffiliateHtml(
  html: string,
  requestPath: string,
  req: express.Request,
): Promise<string> {
  const sharedPreview = await injectSharedRoomPreviewHead(html, requestPath, req);
  if (sharedPreview) return sharedPreview;
  const slug = affiliateSlugFromRequestPath(requestPath);
  const pathname = requestPath.split("?")[0].replace(/\/+$/, "") || "/";
  if (!slug) {
    return injectMainSeoHead(html, {
      canonicalUrl: `${publicOrigin(req)}${pathname}`,
      requestPath,
    });
  }

  const db = await getDb();
  const row = db
    ? (await db
        .select({
          storeName: affiliates.storeName,
          tagline: affiliates.tagline,
          logoUrl: affiliates.logoUrl,
        primaryColor: affiliates.primaryColor,
          publicPhone: affiliates.publicPhone,
          publicEmail: affiliates.publicEmail,
          publicAddress: affiliates.publicAddress,
          showPublicEmail: affiliates.showPublicEmail,
          showPublicPhone: affiliates.showPublicPhone,
          showPublicAddress: affiliates.showPublicAddress,
          faviconUrl: affiliates.faviconUrl,
          serviceArea: affiliates.serviceArea,
          facebookUrl: affiliates.facebookUrl,
          instagramUrl: affiliates.instagramUrl,
        })
        .from(affiliates)
        .where(eq(affiliates.slug, slug))
        .limit(1))[0]
    : null;

  const affiliatePathname = pathname || `/store/${slug}`;
  const kitchenDiscoveryPath = affiliatePathname === `/store/${slug}/kitchens`;
  const kitchenPackagesPath = affiliatePathname === `/store/${slug}/bundles`;
  const storeName = (row?.storeName?.trim() || "Kitchen & Bath Store").replace(/[.]+$/, "");
  const contact = publicContactForStorefront(row ?? {});
  return injectAffiliateWhiteLabelHead(html, {
    slug,
    ...row,
    publicEmail: contact.email,
    publicPhone: contact.phone,
    publicAddress: contact.address,
    ...(kitchenDiscoveryPath
      ? {
          pageTitle: `Plan Your Complete Kitchen with ${storeName}`,
          pageDescription: `Explore kitchen styles, complete package ideas, and a guided design-to-quote path with ${storeName}.`,
        }
      : kitchenPackagesPath
        ? {
            pageTitle: `Kitchen Packages with ${storeName}`,
            pageDescription: `Explore ready-to-customize complete kitchen package ideas with ${storeName}.`,
          }
        : {}),
    canonicalUrl: `${publicOrigin(req, slug)}${affiliatePathname}`,
    indexable: isIndexableAffiliatePath(requestPath, slug),
  });
}

export async function setupVite(app: Express, server: Server) {
  // Dev-only tooling is loaded lazily so a production API server never needs it.
  const [{ createServer: createViteServer }, { default: viteConfig }] = await Promise.all([
    import("vite"),
    import("../../vite.config"),
  ]);
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  // Vite's own HTML fallback serves index.html before later Express handlers.
  // Intercept rewritten affiliate storefront paths first so development matches
  // production: the first HTML byte already carries affiliate-only metadata.
  app.use(async (req, res, next) => {
    if (!affiliateSlugFromRequestPath(req.url)) return next();
    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(req.originalUrl, template);
      const brandedPage = await whiteLabelAffiliateHtml(page, req.url, req);
      return res.status(200).set({ "Content-Type": "text/html" }).end(brandedPage);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      return next(e);
    }
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      const brandedPage = await whiteLabelAffiliateHtml(page, url, req);
      res.status(200).set({ "Content-Type": "text/html" }).end(brandedPage);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Express static middleware may serve index.html for the original root path
  // before the SPA fallback has a chance to inject the affiliate bootstrap.
  // Handle affiliate document requests first, while leaving root-level assets
  // untouched, so a custom domain always begins in its own branded storefront.
  app.use(async (req, res, next) => {
    const slug = res.locals.affiliateSlug as string | undefined;
    const acceptsHtml = req.headers.accept?.includes("text/html") ?? false;
    if (!slug || req.method !== "GET" || !acceptsHtml) return next();
    try {
      const indexHtml = await fs.promises.readFile(
        path.resolve(distPath, "index.html"),
        "utf-8",
      );
      const branded = await whiteLabelAffiliateHtml(indexHtml, `/store/${slug}`, req);
      res.setHeader("Content-Type", "text/html; charset=UTF-8");
      return res.send(branded);
    } catch (error) {
      return next(error);
    }
  });

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req, res, next) => {
    // For affiliate subdomain requests the URL has already been rewritten by the
    // subdomain middleware (e.g. req.url = "/store/reaves-way-cabinet-shop").
    // However the browser's window.location.pathname is still "/" because the
    // rewrite is server-side only.  Inject a tiny bootstrap script so the SPA
    // router can redirect to the correct /store/:slug path on first load.
    const slug = affiliateSlugFromRequestPath(req.url);
    if (slug) {
      const indexHtml = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");
      try {
        const branded = await whiteLabelAffiliateHtml(indexHtml, req.url, req);
        res.setHeader("Content-Type", "text/html; charset=UTF-8");
        return res.send(branded);
      } catch (error) {
        return next(error);
      }
    }
    try {
      const indexHtml = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      const headedPage = await whiteLabelAffiliateHtml(indexHtml, req.url, req);
      res.setHeader("Content-Type", "text/html; charset=UTF-8");
      return res.send(headedPage);
    } catch (error) {
      return next(error);
    }
  });
}
