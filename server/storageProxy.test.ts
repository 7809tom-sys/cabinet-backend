import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import { registerStorageProxy } from "./_core/storageProxy";

// These tests verify the storage proxy makes catalog images cacheable (so phones
// don't re-download multi-image catalogs on every scroll) and still redirects to
// the signed URL. We stub global.fetch so no real Forge/S3 call is made.

function startProxy(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  registerStorageProxy(app);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe("storage proxy", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    // Forge env must be present for the proxy to attempt a presign.
    process.env.BUILT_IN_FORGE_API_URL =
      process.env.BUILT_IN_FORGE_API_URL || "https://forge.example.com";
    process.env.BUILT_IN_FORGE_API_KEY =
      process.env.BUILT_IN_FORGE_API_KEY || "test-key";
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("redirects to the signed URL with a cacheable Cache-Control header", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ url: "https://cdn.example.com/signed/file.jpg" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const { server, baseUrl } = await startProxy();
    try {
      const resp = await realFetch(`${baseUrl}/manus-storage/door-aero-alba_opt_abc.jpg`, {
        redirect: "manual",
      });

      expect(resp.status).toBeGreaterThanOrEqual(300);
      expect(resp.status).toBeLessThan(400);
      expect(resp.headers.get("location")).toBe(
        "https://cdn.example.com/signed/file.jpg",
      );

      const cacheControl = resp.headers.get("cache-control") || "";
      // Must NOT be no-store (the old behavior that broke mobile caching).
      expect(cacheControl).not.toContain("no-store");
      // Must allow public caching.
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    } finally {
      server.close();
    }
  });
});
