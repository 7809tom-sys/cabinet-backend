import type { Express, Request } from "express";
import { eq } from "drizzle-orm";
import { threeDRoomShares } from "../drizzle/schema";
import { getDb } from "./db";
import { injectSharedThreeDViewHead } from "./lib/mainSeoHead";
import { storageGetSignedUrl } from "./storage";

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,48}$/;
const SHARE_ROUTE_PATTERN = /^\/(?:store\/[^/?#]+\/)?3d\/([A-Za-z0-9_-]{16,48})\/?$/;

export function sharedRoomTokenFromPath(requestPath: string): string | null {
  const pathname = requestPath.split("?")[0] ?? "";
  return SHARE_ROUTE_PATTERN.exec(pathname)?.[1] ?? null;
}

function publicOrigin(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() || req.get("host") || "";
  return `${proto}://${host}`;
}

export async function injectSharedRoomPreviewHead(html: string, requestPath: string, req: Request): Promise<string | null> {
  const token = sharedRoomTokenFromPath(requestPath);
  if (!token) return null;
  const db = await getDb();
  const [share] = db
    ? await db.select({ thumbnailKey: threeDRoomShares.thumbnailKey })
      .from(threeDRoomShares)
      .where(eq(threeDRoomShares.token, token))
      .limit(1)
    : [];
  const pathname = requestPath.split("?")[0].replace(/\/+$/, "") || `/3d/${token}`;
  const canonicalUrl = `${publicOrigin(req)}${pathname}`;
  const thumbnailUrl = share?.thumbnailKey
    ? `${publicOrigin(req)}/api/shared-3d-preview/${encodeURIComponent(token)}.jpg`
    : null;
  return injectSharedThreeDViewHead(html, { canonicalUrl, thumbnailUrl });
}

export function registerSharedRoomPreviewRoutes(app: Express) {
  app.get("/api/shared-3d-preview/:token.jpg", async (req, res, next) => {
    const token = req.params.token;
    if (!SHARE_TOKEN_PATTERN.test(token)) return res.status(404).end();
    try {
      const db = await getDb();
      if (!db) return res.status(503).end();
      const [share] = await db
        .select({ thumbnailKey: threeDRoomShares.thumbnailKey })
        .from(threeDRoomShares)
        .where(eq(threeDRoomShares.token, token))
        .limit(1);
      if (!share?.thumbnailKey) return res.status(404).end();
      const signedUrl = await storageGetSignedUrl(share.thumbnailKey);
      res.set("Cache-Control", "private, max-age=300");
      return res.redirect(302, signedUrl);
    } catch (error) {
      return next(error);
    }
  });
}
