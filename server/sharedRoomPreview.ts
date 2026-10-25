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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function publicOrigin(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() || req.get("host") || "";
  return `${proto}://${host}`;
}

function sharePreviewDestination(req: Request, token: string): string {
  const current = new URL(req.originalUrl, publicOrigin(req));
  const destination = new URL(`/3d/${encodeURIComponent(token)}`, publicOrigin(req));
  const view = current.searchParams.get("view");
  if (view) destination.searchParams.set("view", view);
  return destination.toString();
}

export function sharedRoomPreviewDocument(input: {
  canonicalUrl: string;
  destinationUrl: string;
  thumbnailUrl?: string | null;
}): string {
  const destinationUrl = escapeHtml(input.destinationUrl);
  const base = `<!doctype html><html lang="en"><head><title>Shared 3D Kitchen View | CabinetDealz</title></head><body><main><p>Opening the shared CabinetDealz 3D kitchen view.</p><p><a href="${destinationUrl}">Open shared 3D view</a></p></main></body></html>`;
  const headed = injectSharedThreeDViewHead(base, {
    canonicalUrl: input.canonicalUrl,
    thumbnailUrl: input.thumbnailUrl,
  });
  return headed.replace("</head>", `<meta http-equiv="refresh" content="0;url=${destinationUrl}"></head>`);
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
  app.get("/api/shared-3d-view/:token", async (req, res, next) => {
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
      if (!share) return res.status(404).end();
      const origin = publicOrigin(req);
      const thumbnailUrl = share.thumbnailKey
        ? `${origin}/api/shared-3d-preview/${encodeURIComponent(token)}.jpg`
        : null;
      res.set("Cache-Control", "no-store");
      res.type("html");
      return res.send(sharedRoomPreviewDocument({
        canonicalUrl: `${origin}${req.path}`,
        destinationUrl: sharePreviewDestination(req, token),
        thumbnailUrl,
      }));
    } catch (error) {
      return next(error);
    }
  });

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
