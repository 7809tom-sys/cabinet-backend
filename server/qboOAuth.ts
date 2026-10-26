/**
 * QuickBooks Online OAuth2 integration routes.
 *
 * GET /api/qbo/connect   — Admin-only: redirects to Intuit authorization page
 * GET /api/qbo/callback  — Intuit posts back here with code + realmId; stores tokens
 * GET /api/qbo/status    — Returns whether QBO is connected (for admin UI)
 * POST /api/qbo/disconnect — Clears stored tokens
 */

import type { Express, Request, Response } from "express";
import { createRequire } from "module";
import { parse as parseCookie } from "cookie";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const OAuthClient = (require("intuit-oauth") as any).default ?? require("intuit-oauth");
import { getDb } from "./db";
import { qboTokens, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { consumeQboOauthState, issueQboOauthState, QBO_OAUTH_STATE_COOKIE } from "./lib/qboOauthState";

const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID ?? "";
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET ?? "";
const QBO_ENVIRONMENT = (process.env.QBO_ENVIRONMENT ?? "production") as "sandbox" | "production";

function getRedirectUri(req: Request): string {
  // Use the env var if set (required for production); fall back to request host.
  if (process.env.QBO_REDIRECT_URI) return process.env.QBO_REDIRECT_URI;
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const host = req.headers.host ?? "localhost:3000";
  return `${proto}://${host}/api/qbo/callback`;
}

function makeClient(redirectUri: string) {
  return new OAuthClient({
    clientId: QBO_CLIENT_ID,
    clientSecret: QBO_CLIENT_SECRET,
    environment: QBO_ENVIRONMENT,
    redirectUri,
  });
}

async function requireAdmin(req: Request) {
  try {
    const user = await sdk.authenticateRequest(req);
    return user.role === "admin" ? user : null;
  } catch {
    return null;
  }
}

function stateCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const value = parseCookie(header)[QBO_OAUTH_STATE_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function setStateCookie(req: Request, res: Response, state: string) {
  res.cookie(QBO_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    path: "/api/qbo",
    maxAge: 10 * 60 * 1000,
  });
}

export function registerQboRoutes(app: Express) {
  // ── Connect: admin session required, state bound to that admin ─────────────
  app.get("/api/qbo/connect", async (req: Request, res: Response) => {
    const admin = await requireAdmin(req);
    if (!admin) {
      res.status(403).json({ error: "Admin session required." });
      return;
    }
    if (!QBO_CLIENT_ID || !QBO_CLIENT_SECRET) {
      res.status(400).json({ error: "QBO_CLIENT_ID and QBO_CLIENT_SECRET are not configured." });
      return;
    }
    const redirectUri = getRedirectUri(req);
    const client = makeClient(redirectUri);
    const state = issueQboOauthState(admin.id);
    setStateCookie(req, res, state);
    const authorizeUrl = client.authorizeUri({
      scope: [OAuthClient.scopes.Accounting],
      state,
    });
    const wantsJson = (req.headers.accept ?? "").includes("application/json");
    if (wantsJson) {
      res.json({ authorizeUrl });
      return;
    }
    res.redirect(302, authorizeUrl);
  });

  // ── Callback: the browser must present the same state cookie the admin started with
  app.get("/api/qbo/callback", async (req: Request, res: Response) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const pending = consumeQboOauthState(state, stateCookie(req));
    res.clearCookie(QBO_OAUTH_STATE_COOKIE, { path: "/api/qbo" });
    if (!pending) {
      res.status(403).json({ error: "QuickBooks connection state did not match this admin session." });
      return;
    }
    const dbForAdmin = await getDb();
    const [admin] = dbForAdmin
      ? await dbForAdmin.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, pending.userId)).limit(1)
      : [];
    if (!admin || admin.role !== "admin") {
      res.status(403).json({ error: "Admin session required." });
      return;
    }
    const redirectUri = getRedirectUri(req);
    const client = makeClient(redirectUri);
    try {
      const tokenResponse = await client.createToken(req.url);
      const token = tokenResponse.getJson() as {
        access_token: string;
        refresh_token: string;
        realmId: string;
        expires_in: number;
        x_refresh_token_expires_in: number;
      };

      const now = Date.now();
      const accessExpiry = new Date(now + (token.expires_in ?? 3600) * 1000);
      const refreshExpiry = new Date(now + (token.x_refresh_token_expires_in ?? 8640000) * 1000);

      const db = await getDb();
      if (db) {
        // Upsert: always keep exactly one row (id=1).
        const existing = await db.select({ id: qboTokens.id }).from(qboTokens).limit(1);
        if (existing.length > 0) {
          await db.update(qboTokens).set({
            realmId: token.realmId,
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            accessTokenExpiresAt: accessExpiry,
            refreshTokenExpiresAt: refreshExpiry,
            environment: QBO_ENVIRONMENT,
          }).where(eq(qboTokens.id, existing[0].id));
        } else {
          await db.insert(qboTokens).values({
            realmId: token.realmId,
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            accessTokenExpiresAt: accessExpiry,
            refreshTokenExpiresAt: refreshExpiry,
            environment: QBO_ENVIRONMENT,
          });
        }
      }

      console.log("[QBO] Connected to QuickBooks company:", token.realmId);
      res.redirect(302, "/admin?tab=settings&qbo=connected");
    } catch (err) {
      console.error("[QBO] OAuth callback failed:", err);
      res.redirect(302, "/admin?tab=settings&qbo=error");
    }
  });

  // ── Status: is QBO connected? (used by admin UI) ─────────────────────────
  app.get("/api/qbo/status", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req))) {
      res.status(403).json({ error: "Admin session required." });
      return;
    }
    try {
      const db = await getDb();
      if (!db) { res.json({ connected: false }); return; }
      const rows = await db.select({
        realmId: qboTokens.realmId,
        connectedAt: qboTokens.connectedAt,
        refreshTokenExpiresAt: qboTokens.refreshTokenExpiresAt,
        environment: qboTokens.environment,
      }).from(qboTokens).limit(1);
      if (rows.length === 0) { res.json({ connected: false }); return; }
      const row = rows[0];
      const expired = new Date(row.refreshTokenExpiresAt) < new Date();
      res.json({
        connected: !expired,
        realmId: row.realmId,
        connectedAt: row.connectedAt,
        environment: row.environment,
        refreshTokenExpiresAt: row.refreshTokenExpiresAt,
      });
    } catch (err) {
      console.error("[QBO] Status check failed:", err);
      res.json({ connected: false });
    }
  });

  // ── Disconnect: remove stored tokens ─────────────────────────────────────
  app.post("/api/qbo/disconnect", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req))) {
      res.status(403).json({ error: "Admin session required." });
      return;
    }
    try {
      const db = await getDb();
      if (db) {
        const rows = await db.select({ id: qboTokens.id }).from(qboTokens).limit(1);
        if (rows.length > 0) {
          await db.delete(qboTokens).where(eq(qboTokens.id, rows[0].id));
        }
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[QBO] Disconnect failed:", err);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });
}

// ── Shared helper: get a valid access token (auto-refresh if expired) ────────
export async function getQboAccessToken(): Promise<{ accessToken: string; realmId: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(qboTokens).limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];

  const now = new Date();
  if (new Date(row.refreshTokenExpiresAt) < now) {
    console.warn("[QBO] Refresh token expired — user must reconnect.");
    return null;
  }

  // If access token is still valid (with 60s buffer), return it directly.
  if (new Date(row.accessTokenExpiresAt).getTime() - now.getTime() > 60_000) {
    return { accessToken: row.accessToken, realmId: row.realmId };
  }

  // Refresh the access token.
  try {
    const client = makeClient(process.env.QBO_REDIRECT_URI ?? "https://www.cabinetdealz.com/api/qbo/callback");
    client.setToken({
      access_token: row.accessToken,
      refresh_token: row.refreshToken,
      realmId: row.realmId,
      token_type: "bearer",
      expires_in: 0,
      x_refresh_token_expires_in: 0,
    });
    const refreshed = await client.refresh();
    const newToken = refreshed.getJson() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      x_refresh_token_expires_in: number;
    };
    const newAccessExpiry = new Date(Date.now() + (newToken.expires_in ?? 3600) * 1000);
    const newRefreshExpiry = new Date(Date.now() + (newToken.x_refresh_token_expires_in ?? 8640000) * 1000);
    await db.update(qboTokens).set({
      accessToken: newToken.access_token,
      refreshToken: newToken.refresh_token,
      accessTokenExpiresAt: newAccessExpiry,
      refreshTokenExpiresAt: newRefreshExpiry,
    }).where(eq(qboTokens.id, row.id));
    console.log("[QBO] Access token refreshed successfully.");
    return { accessToken: newToken.access_token, realmId: row.realmId };
  } catch (err) {
    console.error("[QBO] Token refresh failed:", err);
    return null;
  }
}
