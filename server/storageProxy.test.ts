import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "http";
import { imageMimeFromBytes, registerStorageProxy } from "./_core/storageProxy";

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
  beforeEach(() => {
    process.env.BUILT_IN_FORGE_API_URL ||= "https://forge.example.com";
    process.env.BUILT_IN_FORGE_API_KEY ||= "test-key";
  });
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
      expect(new URL(fetched[0]).searchParams.get("path")).toBe("media-library/1785260582020_classic_cream_room_scene_18c5ad57");
      const blocked = await realFetch(`${baseUrl}/api/door-style-photo/bad%2Fkey`);
      expect(blocked.status).toBe(400);
      expect(fetched).toHaveLength(2);
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
      expect(new URL(fetched[0]).searchParams.get("path")).toBe("media-library/1790257199386_b12_b21_4dedff25");
      expect((await realFetch(`${baseUrl}/api/catalog-media/bad%2Fkey`)).status).toBe(400);
      expect(fetched).toHaveLength(2);
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
      expect(new URL(fetched[0]).searchParams.get("path")).toBe("sku-images/1784390003470_ASP-B12_738a416d.jpg");
      expect((await realFetch(`${baseUrl}/api/catalog-sku-photo/bad%2Fkey`)).status).toBe(400);
      expect(fetched).toHaveLength(2);
    } finally {
      server.close();
    }
  });
});
