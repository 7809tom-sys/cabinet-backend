import express from "express";
import type { Server } from "http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { corsMiddleware, isOriginAllowed, parseAllowedOrigins } from "./cors";
import { affiliateSlugFromHost, isAffiliateStorefrontBypassPath } from "./affiliateSubdomain";
import { getFrontendShell, resetFrontendShellCache } from "./frontendShell";

describe("isOriginAllowed", () => {
  const allowed = parseAllowedOrigins("https://www.cabinetdealz.com, https://*.cabinetdealz.com/");

  it("allows the exact site and single-label subdomains", () => {
    expect(isOriginAllowed("https://www.cabinetdealz.com", allowed, false)).toBe(true);
    expect(isOriginAllowed("https://acme-shop.cabinetdealz.com", allowed, false)).toBe(true);
  });

  it("rejects look-alikes, other schemes, deeper hosts and the bare domain", () => {
    for (const origin of [
      "https://cabinetdealz.com",
      "http://www.cabinetdealz.com",
      "https://evil-cabinetdealz.com",
      "https://cabinetdealz.com.evil.com",
      "https://a.b.cabinetdealz.com",
      "https://evil.com",
    ]) {
      expect(isOriginAllowed(origin, allowed, false), origin).toBe(false);
    }
    expect(isOriginAllowed(undefined, allowed, true)).toBe(false);
  });

  it("allows localhost only when local development is enabled", () => {
    expect(isOriginAllowed("http://localhost:5173", [], true)).toBe(true);
    expect(isOriginAllowed("http://localhost:5173", [], false)).toBe(false);
  });
});

describe("corsMiddleware", () => {
  let server: Server;
  afterEach(() => server?.close());

  async function start() {
    const app = express();
    app.use(corsMiddleware({ allowedOrigins: "https://www.cabinetdealz.com", allowLocal: false }));
    app.post("/api/trpc/x", (_req, res) => res.json({ ok: true }));
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    const port = (server.address() as { port: number }).port;
    return `http://127.0.0.1:${port}`;
  }

  it("answers a preflight from an allowed origin and lets the Authorization header through", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/trpc/x`, {
      method: "OPTIONS",
      headers: {
        origin: "https://www.cabinetdealz.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://www.cabinetdealz.com");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(res.headers.get("vary")).toContain("Origin");
  });

  it("adds no CORS headers for a disallowed origin, and none when there is no Origin", async () => {
    const base = await start();
    const bad = await fetch(`${base}/api/trpc/x`, { method: "POST", headers: { origin: "https://evil.com" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    const same = await fetch(`${base}/api/trpc/x`, { method: "POST" });
    expect(same.status).toBe(200);
    expect(same.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("affiliate subdomain rules for the split deployment", () => {
  it("never treats the API or site hosts as an affiliate store", () => {
    expect(affiliateSlugFromHost("api.cabinetdealz.com")).toBeNull();
    expect(affiliateSlugFromHost("www.cabinetdealz.com")).toBeNull();
    expect(affiliateSlugFromHost("acme.cabinetdealz.com")).toBe("acme");
  });

  it("lets the page-shell route and health probe bypass the storefront redirect", () => {
    expect(isAffiliateStorefrontBypassPath("/_shell/store/acme")).toBe(true);
    expect(isAffiliateStorefrontBypassPath("/health")).toBe(true);
  });
});

describe("getFrontendShell", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.FRONTEND_SHELL_URL;
    resetFrontendShellCache();
    vi.restoreAllMocks();
  });

  it("returns null when no shell URL is configured", async () => {
    expect(await getFrontendShell()).toBeNull();
  });

  it("accepts only the real app shell and falls back to the last good copy", async () => {
    process.env.FRONTEND_SHELL_URL = "https://front.example.test/index.html";
    const html = '<html><body><div id="root"></div></body></html>';
    global.fetch = vi.fn(async () => new Response(html, { status: 200 })) as unknown as typeof fetch;
    expect(await getFrontendShell()).toBe(html);

    // Expire the cache by switching to an error page: the good copy is not replaced.
    resetFrontendShellCache();
    global.fetch = vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 200 })) as unknown as typeof fetch;
    expect(await getFrontendShell()).toBeNull();
  });
});
