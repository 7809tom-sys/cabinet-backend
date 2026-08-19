import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Express, Request, Response } from "express";

// Mock the DB layer so the sitemap route is deterministic and offline-safe.
vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: async () => [
          { styleCode: "ASP" },
          { styleCode: "SW" },
          { styleCode: "ASP" }, // duplicate -> should be deduped
          { styleCode: "" }, // empty -> should be skipped
          { styleCode: "A&B" }, // needs XML escaping
        ],
      }),
    }),
  })),
}));

import { registerSeoRoutes } from "./seo";

/** Minimal Express stub that captures GET handlers and runs them. */
function makeApp() {
  const handlers: Record<string, (req: Request, res: Response) => unknown> = {};
  const app = {
    get(path: string, handler: (req: Request, res: Response) => unknown) {
      handlers[path] = handler;
    },
  } as unknown as Express;
  return { app, handlers };
}

function makeReq(headers: Record<string, string> = {}): Request {
  return {
    headers,
    protocol: "http",
    get(name: string) {
      if (name.toLowerCase() === "host") return headers["host"] ?? "localhost:3000";
      return undefined;
    },
  } as unknown as Request;
}

function makeRes() {
  const state: { body?: string; type?: string } = {};
  const res = {
    set() {
      return res;
    },
    send(body: string) {
      state.body = body;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

describe("SEO routes", () => {
  let handlers: Record<string, (req: Request, res: Response) => unknown>;

  beforeEach(() => {
    const made = makeApp();
    handlers = made.handlers;
    registerSeoRoutes(made.app);
  });

  it("registers /robots.txt and /sitemap.xml", () => {
    expect(typeof handlers["/robots.txt"]).toBe("function");
    expect(typeof handlers["/sitemap.xml"]).toBe("function");
  });

  it("robots.txt points the Sitemap at the live request host", async () => {
    const { res, state } = makeRes();
    await handlers["/robots.txt"](makeReq({ host: "example.com" }), res);
    expect(state.body).toContain("Sitemap: http://example.com/sitemap.xml");
    expect(state.body).toContain("Disallow: /cart");
    expect(state.body).toContain("Disallow: /admin");
  });

  it("robots.txt honors x-forwarded-proto/host", async () => {
    const { res, state } = makeRes();
    await handlers["/robots.txt"](
      makeReq({
        host: "internal:3000",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "cabinet-dealz.com",
      }),
      res,
    );
    expect(state.body).toContain("Sitemap: https://cabinet-dealz.com/sitemap.xml");
  });

  it("sitemap includes stable routes and deduped, escaped family URLs", async () => {
    const { res, state } = makeRes();
    await handlers["/sitemap.xml"](makeReq({ host: "example.com" }), res);
    const body = state.body ?? "";

    // Stable routes
    expect(body).toContain("<loc>http://example.com/</loc>");
    expect(body).toContain("<loc>http://example.com/styles</loc>");
    expect(body).toContain("<loc>http://example.com/bundles</loc>");
    expect(body).toContain("<loc>http://example.com/surfaces</loc>");
    expect(body).toContain("<loc>http://example.com/stonecreek</loc>");
    expect(body).not.toContain("<loc>http://example.com/design</loc>");

    // Family URLs (deduped: ASP appears once)
    const aspMatches = body.match(/\/family\/ASP</g) ?? [];
    expect(aspMatches.length).toBe(1);
    expect(body).toContain("/family/SW");

    // Empty styleCode skipped
    expect(body).not.toContain("/family/<");

    // XML-escaped ampersand (A&B -> encodeURIComponent -> A%26B, no raw &)
    expect(body).not.toMatch(/<loc>[^<]*&(?!amp;)/);

    // Valid sitemap envelope
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain("http://www.sitemaps.org/schemas/sitemap/0.9");
  });

  it("uses a white-label sitemap and blocks private affiliate workflow paths", async () => {
    const robots = makeRes();
    await handlers["/robots.txt"](
      makeReq({ host: "reaves-way-cabinet-shop.cabinetdealz.com" }),
      robots.res,
    );
    expect(robots.state.body).toContain("# Branded storefront crawl policy");
    expect(robots.state.body).toContain("Disallow: /store/*/design");
    expect(robots.state.body).not.toContain("# Cabinet Dealz crawl policy");

    const sitemap = makeRes();
    await handlers["/sitemap.xml"](
      makeReq({ host: "reaves-way-cabinet-shop.cabinetdealz.com" }),
      sitemap.res,
    );
    expect(sitemap.state.body).toContain(
      "http://reaves-way-cabinet-shop.cabinetdealz.com/store/reaves-way-cabinet-shop",
    );
    expect(sitemap.state.body).not.toContain("/family/");
  });
});
