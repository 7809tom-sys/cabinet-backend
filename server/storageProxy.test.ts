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
});
