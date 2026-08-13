import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { affiliateSlugFromHostCandidates } from "../lib/affiliateSubdomain";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerQboRoutes } from "../qboOAuth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerSeoRoutes } from "../seo";
import { apexRedirectMiddleware } from "../apexRedirect";
import fs from "fs";
import path from "path";
import { registerStripeWebhook } from "../stripeWebhook";

// Resolve the build version once at startup. The framework emits a build stamp
// at client/public/__manus__/version.json during the build; if present we use
// it, otherwise we fall back to the server boot time so dev still works.
function resolveAppVersion(): string {
  const candidates = [
    path.resolve(process.cwd(), "dist/public/__manus__/version.json"),
    path.resolve(process.cwd(), "client/public/__manus__/version.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, "utf8");
      const data = JSON.parse(raw) as { version?: string };
      if (data && typeof data.version === "string") return data.version;
    } catch {
      // ignore and try next
    }
  }
  return `boot-${Date.now()}`;
}

const APP_VERSION = resolveAppVersion();

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
    // Narrow, opt-in deployment diagnostic. It is removed once the edge header
    // behavior is confirmed and never affects ordinary storefront responses.
    if (req.query.affiliateRoutingDebug === "1") {
      res.setHeader("X-Affiliate-Routing-Debug", JSON.stringify({
        candidates: hostCandidates.map((value) => Array.isArray(value) ? value[0] : value ?? null),
        slug: subdomain,
      }));
    }
    if (!subdomain) return next();
    // Don't rewrite API calls, static assets, or already-prefixed store paths
    if (req.url.startsWith("/api/") || req.url.startsWith("/store/") || req.url.startsWith("/__manus__") || req.url.startsWith("/manus-storage")) {
      return next();
    }
    // Rewrite: / → /store/slug, /cart → /store/slug/cart, etc.
    const originalUrl = req.url === "/" ? "" : req.url;
    req.url = `/store/${subdomain}${originalUrl}`;
    next();
  });
  // Stripe webhook MUST be registered before express.json() so the raw body
  // is available for signature verification.
  registerStripeWebhook(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerQboRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // SEO: dynamic robots.txt + sitemap.xml (must be registered before the
  // Vite/static SPA fallback so they aren't swallowed by the catch-all).
  registerSeoRoutes(app);
  // Build-version endpoint for the client-side stale-cache watcher. Registered
  // before the SPA fallback so it always returns JSON (never the HTML shell).
  app.get("/__manus__/app-version.json", (_req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({ version: APP_VERSION });
  });
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
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
}

startServer().catch(console.error);
