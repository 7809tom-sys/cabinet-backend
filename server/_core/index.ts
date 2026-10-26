import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { affiliateSlugFromHostCandidates, affiliateStorefrontPath, isAffiliateStorefrontBypassPath } from "../lib/affiliateSubdomain";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerQboRoutes } from "../qboOAuth";
import { registerVendorInventorySync } from "../vendorInventoryHttp";
import { registerStorageProxy } from "./storageProxy";
import { registerSharedRoomPreviewRoutes } from "../sharedRoomPreview";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite, whiteLabelAffiliateHtml } from "./vite";
import { registerSeoRoutes } from "../seo";
import { apexRedirectMiddleware } from "../apexRedirect";
import fs from "fs";
import path from "path";
import { registerStripeWebhook } from "../stripeWebhook";
import { sdk } from "./sdk";
import cron from "node-cron";
import { corsMiddleware } from "../lib/cors";
import { getFrontendShell } from "../lib/frontendShell";
import { recoverDueGeminiImageTestJobs } from "../routers/designPhotoRenders";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Trust the proxy so req.headers.host reflects the original public host
  // (Cloud Run / Manus edge terminate TLS in front of us).
  app.set("trust proxy", true);
  // Deployment liveness checks must be host-agnostic and must not enter the
  // SPA, authentication, affiliate rewriting, or database layers. Keep this
  // route ahead of all hostname-specific middleware so a platform probe can
  // isolate process health from storefront routing.
  app.get("/health", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(200).json({ ok: true });
  });
  // Cross-origin access for the separately hosted frontend. Before every other
  // middleware so preflight requests are answered before host-based routing.
  app.use(corsMiddleware());
  // Redirect the naked apex domain (cabinetdealz.com) to https://www.cabinetdealz.com.
  // No-op for localhost, *.manus.space/.manus.computer, and the www host, so it is
  // safe to run before everything else.
  app.use(apexRedirectMiddleware);
  // ─── Affiliate subdomain routing ─────────────────────────────────────────────
  // Detects affiliate subdomains (e.g., reaves-way-cabinet-shop.cabinetdealz.com)
  // and internally rewrites the URL to /store/:slug so the SPA serves the
  // affiliate's white-labeled storefront. API/tRPC/static paths are excluded.
  app.use((req, res, next) => {
    // A CDN/deployment edge may expose the public hostname as X-Original-Host,
    // X-Forwarded-Host, or X-Host while Host/hostname identify an internal
    // Manus service. Prefer the public headers in that order so a customer on
    // the affiliate domain always reaches their branded storefront.
    const hostCandidates = [
      req.headers["x-original-host"],
      req.headers["x-forwarded-host"],
      req.headers["x-host"],
      req.hostname,
      req.headers.host,
    ];
    const subdomain = affiliateSlugFromHostCandidates(hostCandidates);
    if (!subdomain) return next();
    // Don't rewrite API calls, static assets, or already-prefixed store paths.
    // The browser must still retrieve its JavaScript/CSS/image assets at the
    // normal root paths even while the document itself is brand-routed.
    if (isAffiliateStorefrontBypassPath(req.url)) {
      return next();
    }
    // Canonicalize the browser URL as well as the server request. A real
    // redirect makes the white-label route independent of a cached or
    // transparent client bundle, while keeping the customer on their own
    // affiliate subdomain.
    return res.redirect(307, affiliateStorefrontPath(subdomain, req.url));
  });
  // Stripe webhook MUST be registered before express.json() so the raw body
  // is available for signature verification.
  registerStripeWebhook(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerSharedRoomPreviewRoutes(app);
  registerQboRoutes(app);
  registerVendorInventorySync(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      // The designer prices hundreds of exact cabinet/style identities in one
      // query. The client sends query batches by POST so proxy URL limits cannot
      // return an HTML 414 page where tRPC expects JSON.
      allowMethodOverride: true,
    })
  );
  // SEO: dynamic robots.txt + sitemap.xml (must be registered before the
  // Vite/static SPA fallback so they aren't swallowed by the catch-all).
  registerSeoRoutes(app);
  // Page shell for the Vercel-hosted frontend: Vercel forwards /store/* and /3d/*
  // here so the backend can inject affiliate branding and share previews into
  // the built index.html (fetched from FRONTEND_SHELL_URL). See DEPLOY.md.
  app.get("/_shell/*", async (req, res) => {
    const requestPath = req.originalUrl.slice("/_shell".length) || "/";
    const shell = await getFrontendShell();
    if (!shell) return res.status(502).type("text/plain").send("Frontend shell unavailable");
    try {
      const page = await whiteLabelAffiliateHtml(shell, requestPath, req);
      res.setHeader("Content-Type", "text/html; charset=UTF-8");
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      return res.send(page);
    } catch (error) {
      console.error("[Shell] head injection failed", error instanceof Error ? error.name : "unknown error");
      return res.status(200).type("html").send(shell);
    }
  });
  // development mode uses Vite, production mode uses static files
  if (process.env.SERVE_CLIENT === "false") {
    // API-only deployment (Railway): the frontend is a separate static site.
    app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  } else if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Extend timeout to 120s to allow AI image generation (which can take 30–60s)
  server.timeout = 120000;
  server.keepAliveTimeout = 125000;
  server.headersTimeout = 130000;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Recover queued/pending Google image-test jobs every minute. The work comes
  // from the durable database queue and is guarded per job, so a missed tick or
  // a restart only delays recovery. America/Chicago keeps any future
  // wall-clock schedules correct across daylight-saving changes.
  cron.schedule(
    "* * * * *",
    async () => {
      try {
        await recoverDueGeminiImageTestJobs();
      } catch (error) {
        console.error("[Google image test recovery] Scheduled job failed", error instanceof Error ? error.name : "unknown error");
      }
    },
    { timezone: "America/Chicago", noOverlap: true },
  );
}

startServer().catch(console.error);
