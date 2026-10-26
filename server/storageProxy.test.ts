import { describe, expect, it, vi, afterEach } from "vitest";

// ENV is read when the proxy module loads, so configure storage first.
vi.hoisted(() => {
  process.env.SUPABASE_URL ||= "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
});
import express from "express";
import type { Server } from "http";
import { imageMimeFromBytes, registerStorageProxy, setStorageProxyAuthenticator } from "./_core/storageProxy";

function startProxy(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  registerStorageProxy(app);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}` });
    });
  });
}

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

describe("storage proxy image delivery", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("identifies only verified image signatures, never a non-image object", () => {
    expect(imageMimeFromBytes(jpeg)).toBe("image/jpeg");
    expect(imageMimeFromBytes(png)).toBe("image/png");
    expect(imageMimeFromBytes(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
    expect(imageMimeFromBytes(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(imageMimeFromBytes(Uint8Array.from([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it.each([[
    "media-library/real-jpeg", jpeg, "image/jpeg",
  ], [
    "media-library/real-png", png, "image/png",
  ]] as const)("streams %s using its verified image type, not upstream octet-stream", async (key, bytes, type) => {
    global.fetch = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("presign/get")
        ? new Response(JSON.stringify({ url: "https://cdn.example.com/photo" }), { headers: { "content-type": "application/json" } })
        : new Response(bytes as unknown as BodyInit, { headers: { "content-type": "application/octet-stream", "content-length": String(bytes.length) } }),
    ) as unknown as typeof fetch;
    const { server, baseUrl } = await startProxy();
    try {
      const resp = await realFetch(`${baseUrl}/manus-storage/${key}`);
      expect(resp.status).toBe(200);
      expect(resp.headers.get("content-type")).toContain(type);
      expect(resp.headers.get("cache-control")).toContain("public");
      expect(resp.headers.get("content-length")).toBe(String(bytes.length));
      expect(new Uint8Array(await resp.arrayBuffer())).toEqual(bytes);
    } finally {
      server.close();
    }
  });

  it("keeps a non-image download typed as octet-stream", async () => {
    const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);
    global.fetch = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("presign/get")
        ? new Response(JSON.stringify({ url: "https://cdn.example.com/report" }), { headers: { "content-type": "application/json" } })
        : new Response(pdf as unknown as BodyInit, { headers: { "content-type": "application/octet-stream" } }),
    ) as unknown as typeof fetch;
    const { server, baseUrl } = await startProxy();
    try {
      const resp = await realFetch(`${baseUrl}/manus-storage/spec-book`);
      expect(resp.status).toBe(200);
      expect(resp.headers.get("content-type")).toContain("application/octet-stream");
      expect(new Uint8Array(await resp.arrayBuffer())).toEqual(pdf);
    } finally {
      server.close();
    }
  });

  it("detects JPEG correctly even if the upstream sends the signature one byte per chunk", async () => {
    global.fetch = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("presign/get")
        ? new Response(JSON.stringify({ url: "https://cdn.example.com/slow-jpeg" }), { headers: { "content-type": "application/json" } })
        : new Response(new ReadableStream({
            start(controller) {
              for (const byte of Array.from(jpeg)) controller.enqueue(Uint8Array.of(byte));
              controller.close();
            },
          }), { headers: { "content-type": "application/octet-stream" } }),
    ) as unknown as typeof fetch;
    const { server, baseUrl } = await startProxy();
    try {
      const resp = await realFetch(`${baseUrl}/manus-storage/slow-jpeg`);
      expect(resp.status).toBe(200);
      expect(resp.headers.get("content-type")).toContain("image/jpeg");
      expect(new Uint8Array(await resp.arrayBuffer())).toEqual(jpeg);
    } finally {
      server.close();
    }
  });

  it("serves the exact media-library photo through an app-owned API route with verified MIME", async () => {
    const fetched: string[] = [];
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      fetched.push(url);
      return url.includes("presign/get")
        ? new Response(JSON.stringify({ url: "https://cdn.example.com/exact-scene" }), { headers: { "content-type": "application/json" } })
        : new Response(jpeg as unknown as BodyInit, { headers: { "content-type": "application/octet-stream" } });
    }) as unknown as typeof fetch;
    const { server, baseUrl } = await startProxy();
    try {
      const resp = await realFetch(`${baseUrl}/api/door-style-photo/1785260582020_classic_cream_room_scene_18c5ad57?cd-image-retry-nonce=test`);
      expect(resp.status).toBe(200);
      expect(resp.headers.get("content-type")).toContain("image/jpeg");
      expect(new Uint8Array(await resp.arrayBuffer())).toEqual(jpeg);
      expect(fetched[0]).toContain("/storage/v1/object/authenticated/site-media/media-library/1785260582020_classic_cream_room_scene_18c5ad57");
      const blocked = await realFetch(`${baseUrl}/api/door-style-photo/bad%2Fkey`);
      expect(blocked.status).toBe(400);
      expect(fetched).toHaveLength(1);
    } finally {
      server.close();
    }
  });

  it("serves approved cabinet artwork through the restricted catalog-media alias", async () => {
    const fetched: string[] = [];
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      fetched.push(url);
      return url.includes("presign/get")
        ? new Response(JSON.stringify({ url: "https://cdn.example.com/approved-b12-art" }), { headers: { "content-type": "application/json" } })
        : new Response(png as unknown as BodyInit, { headers: { "content-type": "application/octet-stream" } });
    }) as unknown as typeof fetch;
    const { server, baseUrl } = await startProxy();
    try {
      const resp = await realFetch(`${baseUrl}/api/catalog-media/1790257199386_b12_b21_4dedff25?cd-image-retry-nonce=one`);
      expect(resp.status).toBe(200);
      expect(resp.headers.get("content-type")).toContain("image/png");
      expect(new Uint8Array(await resp.arrayBuffer())).toEqual(png);
      expect(fetched[0]).toContain("/storage/v1/object/authenticated/site-media/media-library/1790257199386_b12_b21_4dedff25");
      expect((await realFetch(`${baseUrl}/api/catalog-media/bad%2Fkey`)).status).toBe(400);
      expect(fetched).toHaveLength(1);
    } finally {
      server.close();
    }
  });

  it("recovers the exact B12 supplier SKU JPEG with image/jpeg rather than octet-stream", async () => {
    const fetched: string[] = [];
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      fetched.push(url);
      return url.includes("presign/get")
        ? new Response(JSON.stringify({ url: "https://cdn.example.com/approved-b12-sku" }), { headers: { "content-type": "application/json" } })
        : new Response(jpeg as unknown as BodyInit, { headers: { "content-type": "application/octet-stream" } });
    }) as unknown as typeof fetch;
    const { server, baseUrl } = await startProxy();
    try {
      const photo = await realFetch(`${baseUrl}/api/catalog-sku-photo/1784390003470_ASP-B12_738a416d.jpg?cd-image-retry-nonce=one`);
      expect(photo.status).toBe(200);
      expect(photo.headers.get("content-type")).toContain("image/jpeg");
      expect(new Uint8Array(await photo.arrayBuffer())).toEqual(jpeg);
      expect(fetched[0]).toContain("/storage/v1/object/authenticated/site-media/sku-images/1784390003470_ASP-B12_738a416d.jpg");
      expect((await realFetch(`${baseUrl}/api/catalog-sku-photo/bad%2Fkey`)).status).toBe(400);
      expect(fetched).toHaveLength(1);
    } finally {
      server.close();
    }
  });
});

describe("storage proxy Supabase routing", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    setStorageProxyAuthenticator(null);
    vi.restoreAllMocks();
  });

  it("reads public media anonymously and refuses private keys without an owner", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
      return new Response(jpeg as unknown as BodyInit, { headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;
    const { server, baseUrl } = await startProxy();
    try {
      expect((await realFetch(`${baseUrl}/manus-storage/media-library/logo.jpg`)).status).toBe(200);
      expect((await realFetch(`${baseUrl}/manus-storage/ocr-uploads/u7-quote.jpg`)).status).toBe(403);
      expect((await realFetch(`${baseUrl}/manus-storage/affiliate-w9-id/license.jpg`)).status).toBe(403);
    } finally {
      server.close();
    }
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toContain("/storage/v1/object/authenticated/site-media/media-library/logo.jpg");
    expect(seen[0].auth === "Bearer test-service-key" || seen[0].auth?.startsWith("Bearer ")).toBe(true);
  });

  it("serves a private upload to its owner and a government ID to an admin", async () => {
    const seen: string[] = [];
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      seen.push(String(input));
      return new Response(jpeg as unknown as BodyInit, { headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;
    setStorageProxyAuthenticator(async (req) => {
      const role = req.headers["x-test-role"];
      if (role === "admin") return { id: 1, role: "admin", email: "admin@example.com", distributorId: null };
      if (role === "owner") return { id: 7, role: "user", email: "owner@example.com", distributorId: null };
      return { id: 8, role: "user", email: "other@example.com", distributorId: null };
    });
    const { server, baseUrl } = await startProxy();
    try {
      const owner = await realFetch(`${baseUrl}/manus-storage/ocr-uploads/u7-quote.jpg`, { headers: { "x-test-role": "owner" } });
      const stranger = await realFetch(`${baseUrl}/manus-storage/ocr-uploads/u7-quote.jpg`, { headers: { "x-test-role": "stranger" } });
      const admin = await realFetch(`${baseUrl}/manus-storage/affiliate-w9-id/license.jpg`, { headers: { "x-test-role": "admin" } });
      expect(owner.status).toBe(200);
      expect(stranger.status).toBe(403);
      expect(admin.status).toBe(200);
      expect(owner.headers.get("cache-control")).toContain("no-store");
    } finally {
      server.close();
    }
    expect(seen.some((url) => url.includes("/private-files/ocr-uploads/u7-quote.jpg"))).toBe(true);
    expect(seen.some((url) => url.includes("/private-files/affiliate-w9-id/license.jpg"))).toBe(true);
  });

  it("answers a file missing from Supabase with 404, not a server error", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "not_found" }), { status: 400 })) as unknown as typeof fetch;
    const { server, baseUrl } = await startProxy();
    try {
      expect((await realFetch(`${baseUrl}/manus-storage/missing.png`)).status).toBe(404);
    } finally {
      server.close();
    }
  });
});
