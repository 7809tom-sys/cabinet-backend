import type { Express, Request, Response } from "express";
import { Readable } from "stream";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { storageFetchObject } from "../storage";
import { canReadStorageKey, type StorageActor } from "../lib/storageAccess";

async function defaultStorageActor(req: Request): Promise<StorageActor | null> {
  if (!req.headers.authorization) return null;
  try {
    const user = await sdk.authenticateRequest(req);
    return {
      id: user.id,
      role: user.role,
      email: user.email,
      distributorId: user.distributorId ?? null,
    };
  } catch {
    return null;
  }
}

let resolveStorageActor = defaultStorageActor;

/** Tests replace the authenticator. Production uses the Supabase bearer session. */
export function setStorageProxyAuthenticator(fn: ((req: Request) => Promise<StorageActor | null>) | null): void {
  resolveStorageActor = fn ?? defaultStorageActor;
}

/** Storage may label extensionless media-library photos as octet-stream. */
export function imageMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(Buffer.from(bytes.subarray(0, 6)).toString("ascii"))) return "image/gif";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp" && ["avif", "avis"].includes(Buffer.from(bytes.subarray(8, 12)).toString("ascii"))) return "image/avif";
  return null;
}

export function registerStorageProxy(app: Express) {
  async function serveStorageKey(key: string | undefined, req: Request, res: Response) {
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (key.startsWith("affiliate-resources/")) {
      res.status(403).send("This file is available only to signed-in affiliates");
      return;
    }

    const actor = await resolveStorageActor(req);
    const allowed = await canReadStorageKey(key, actor);
    if (!allowed) {
      res.status(403).send("Forbidden");
      return;
    }

    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      // Stream original bytes from Supabase Storage, never substitute another image.
      const imageResp = await storageFetchObject(key);
      if (imageResp.status === 400 || imageResp.status === 404) {
        // Supabase answers a missing object with 400 or 404.
        res.status(404).send("File not found");
        return;
      }
      if (!imageResp.ok) {
        const body = await imageResp.text().catch(() => "");
        console.error(`[StorageProxy] storage error: ${imageResp.status} ${body.slice(0, 200)}`);
        res.status(502).send("Failed to fetch file from storage");
        return;
      }
      if (!imageResp.body) {
        res.status(502).send("Empty image body");
        return;
      }

      const reader = imageResp.body.getReader();
      const prefixChunks: Uint8Array[] = [];
      let prefixLength = 0;
      while (prefixLength < 12) {
        const next = await reader.read();
        if (next.done) break;
        if (next.value.length) {
          prefixChunks.push(next.value);
          prefixLength += next.value.length;
        }
      }
      if (!prefixLength) {
        res.status(502).send("Empty image body");
        return;
      }
      const prefix = Buffer.concat(prefixChunks, prefixLength);
      const upstreamType = imageResp.headers.get("content-type") || "application/octet-stream";
      const contentType = upstreamType === "application/octet-stream"
        ? imageMimeFromBytes(prefix) ?? upstreamType
        : upstreamType;
      const contentLength = imageResp.headers.get("content-length");
      const cacheControl = key.startsWith("affiliate-w9-id/") || key.startsWith("ocr-uploads/") || key.startsWith("fixture-uploads/") || key.startsWith("door-match-uploads/") || key.startsWith("distributor-catalogs/") || key.startsWith("vendor-products-source/")
        ? "private, no-store"
        : "public, max-age=31536000, immutable";
      res.set("Cache-Control", cacheControl);
      res.set("Content-Type", contentType);
      if (contentLength) res.set("Content-Length", contentLength);

      const body = (async function* () {
        for (const chunk of prefixChunks) yield chunk;
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          yield next.value;
        }
      })();
      Readable.from(body).on("error", (err) => res.destroy(err)).pipe(res);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      if (!res.headersSent) res.status(502).send("Storage proxy error");
      else res.destroy(err instanceof Error ? err : undefined);
    }
  }

  // Retain the local legacy path, but the public platform redirects /manus-storage
  // to the CDN before Express can handle it. The distinct /api route reaches this app.
  app.get("/manus-storage/*", (req, res) => serveStorageKey((req.params as Record<string, string>)[0], req, res));
  const servePublicCatalogMedia = (req: Request, res: Response) => {
    const imageKey = req.params.imageKey;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(imageKey)) {
      res.status(400).send("Invalid catalog media key");
      return;
    }
    return serveStorageKey(`media-library/${imageKey}`, req, res);
  };
  app.get("/api/door-style-photo/:imageKey", servePublicCatalogMedia);
  app.get("/api/catalog-media/:imageKey", servePublicCatalogMedia);
  app.get("/api/catalog-sku-photo/:imageKey", (req, res) => {
    const imageKey = req.params.imageKey;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(imageKey)) {
      res.status(400).send("Invalid catalog SKU image key");
      return;
    }
    return serveStorageKey(`sku-images/${imageKey}`, req, res);
  });
}
