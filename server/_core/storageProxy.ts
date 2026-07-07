import type { Express } from "express";
import { ENV } from "./env";

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

      // Fetch the actual image bytes and pipe them directly.
      // This avoids a 307 redirect to a signed/expiring CDN URL, which
      // Google's image crawler does not follow reliably. Serving bytes
      // directly gives Google (and all bots) a stable, cacheable URL.
      const imageResp = await fetch(url);
      if (!imageResp.ok) {
        res.status(502).send("Failed to fetch image from storage");
        return;
      }

      const contentType = imageResp.headers.get("content-type") || "image/jpeg";
      const contentLength = imageResp.headers.get("content-length");

      // Storage keys are content-addressed so the bytes never change —
      // cache aggressively for browsers and CDNs.
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      res.set("Content-Type", contentType);
      if (contentLength) res.set("Content-Length", contentLength);

      // Stream the image body to the client
      const reader = imageResp.body;
      if (!reader) {
        res.status(502).send("Empty image body");
        return;
      }

      // Use Node.js Readable.fromWeb if available, otherwise fall back to buffer
      const { Readable } = await import("stream");
      if (typeof (Readable as any).fromWeb === "function") {
        const nodeStream = (Readable as any).fromWeb(reader);
        nodeStream.pipe(res);
      } else {
        const buffer = Buffer.from(await imageResp.arrayBuffer());
        res.send(buffer);
      }
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
