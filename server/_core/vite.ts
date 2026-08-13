import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import { eq } from "drizzle-orm";
import viteConfig from "../../vite.config";
import { getDb } from "../db";
import { affiliates } from "../../drizzle/schema";
import { injectAffiliateWhiteLabelHead } from "../lib/affiliateWhiteLabelHead";

function affiliateSlugFromRequestPath(requestPath: string): string | null {
  const slugMatch = requestPath.match(/^\/store\/([^/?#]+)/);
  return slugMatch?.[1] ?? null;
}

async function whiteLabelAffiliateHtml(html: string, requestPath: string): Promise<string> {
  const slug = affiliateSlugFromRequestPath(requestPath);
  if (!slug) return html;

  const db = await getDb();
  const row = db
    ? (await db
        .select({
          storeName: affiliates.storeName,
          tagline: affiliates.tagline,
          logoUrl: affiliates.logoUrl,
          primaryColor: affiliates.primaryColor,
        })
        .from(affiliates)
        .where(eq(affiliates.slug, slug))
        .limit(1))[0]
    : null;

  return injectAffiliateWhiteLabelHead(html, { slug, ...row });
}

export async function setupVite(app: Express, server: Server) {
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
      const brandedPage = await whiteLabelAffiliateHtml(page, req.url);
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
      const brandedPage = await whiteLabelAffiliateHtml(page, req.url);
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
        const branded = await whiteLabelAffiliateHtml(indexHtml, req.url);
        res.setHeader("Content-Type", "text/html; charset=UTF-8");
        return res.send(branded);
      } catch (error) {
        return next(error);
      }
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
