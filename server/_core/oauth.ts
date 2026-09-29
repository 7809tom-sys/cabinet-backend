import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { resolveOAuthReturnPath } from "../oauthReturnPath";
import { resolveAffiliateAdministrationDestination } from "../oauthAffiliateDestination";
import { affiliates } from "../../drizzle/schema";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Build a safe absolute redirect back to the site the user came from.
 * We always send users back to a real page (never a raw JSON error page) so a
 * sign-in hiccup never shows a dead end to a prospect. The error reason is
 * passed as a query flag the frontend can surface as a friendly toast.
 */
function failRedirect(res: Response, reason: string) {
  const target = `/?auth_error=${encodeURIComponent(reason)}`;
  res.redirect(302, target);
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      console.warn("[OAuth] Callback missing code/state", {
        hasCode: Boolean(code),
        hasState: Boolean(state),
      });
      failRedirect(res, "missing_params");
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        console.error("[OAuth] Callback succeeded but openId missing from user info");
        failRedirect(res, "no_openid");
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

	      const returnPath = resolveOAuthReturnPath(state);
	      let destination = returnPath;
	      const database = await db.getDb();
	      const signedInUser = await db.getUserByOpenId(userInfo.openId);
	      if (database && signedInUser) {
	        const affiliateRows = await database.select().from(affiliates);
	        destination = resolveAffiliateAdministrationDestination({
	          returnPath,
	          userId: signedInUser.id,
	          email: userInfo.email ?? signedInUser.email,
	          userRole: signedInUser.role,
	          affiliates: affiliateRows,
	        }) ?? returnPath;
	      }

      res.redirect(302, destination);
    } catch (error) {
      // Surface as much detail as we safely can for diagnosis. Upstream axios
      // errors carry status + response body which pinpoint redirectUri/appId
      // mismatches — the most common live-deploy callback failure.
      const anyErr = error as {
        message?: string;
        response?: { status?: number; data?: unknown };
        code?: string;
      };
      // The redirectUri is base64-encoded in `state`; decoding it here tells us
      // exactly which origin was sent upstream, so a live-domain mismatch (e.g.
      // cabinetdeals.com not yet registered with the OAuth app) is obvious in
      // the logs without guesswork.
      let attemptedRedirectUri: string | undefined;
      try {
        attemptedRedirectUri = Buffer.from(state, "base64").toString("utf8");
      } catch {
        attemptedRedirectUri = undefined;
      }
      console.error("[OAuth] Callback failed", {
        message: anyErr?.message,
        upstreamStatus: anyErr?.response?.status,
        upstreamData: anyErr?.response?.data,
        code: anyErr?.code,
        attemptedRedirectUri,
        host: req.headers?.host,
      });
      failRedirect(res, "exchange_failed");
    }
  });
}
