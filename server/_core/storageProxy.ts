import type { Express } from "express";
import { Readable } from "stream";
import { ENV } from "./env";

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
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      // Serve stable, cacheable bytes rather than an expiring CDN redirect.
      const imageResp = await fetch(url);
      if (!imageResp.ok) {
        res.status(502).send("Failed to fetch image from storage");
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
      // Do not turn unrelated downloads into images; only correct actual image signatures.
      const contentType = upstreamType === "application/octet-stream"
        ? imageMimeFromBytes(prefix) ?? upstreamType
        : upstreamType;
      const contentLength = imageResp.headers.get("content-length");
      res.set("Cache-Control", "public, max-age=31536000, immutable");
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
  });
}
