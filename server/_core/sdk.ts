import { AXIOS_TIMEOUT_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios from "axios";
import type { Request } from "express";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const ASYMMETRIC_ALGS = ["ES256", "RS256"] as const;

function isAsymmetricAlg(alg: string | undefined): alg is (typeof ASYMMETRIC_ALGS)[number] {
  return alg === "ES256" || alg === "RS256";
}

/** Only real JOSE algorithm names are written to the log. */
function safeAlgLabel(alg: string | undefined): string {
  if (!alg || !/^[A-Za-z0-9_-]{1,32}$/.test(alg)) return "(unrecognized)";
  return alg;
}

function authFailureDetail(error: unknown, token: string): string {
  const raw = error instanceof Error ? String(error) : "unknown error";
  return token ? raw.split(token).join("[redacted]") : raw;
}

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let remoteJwksUrl: string | undefined;

/**
 * Module-level JWKS resolver. Reused for the life of the process so jose can
 * keep its key cache instead of fetching on every request.
 */
function supabaseRemoteJwks(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> | null {
  const base = supabaseUrl.trim().replace(/\/+$/, "");
  if (!base) return null;
  const jwksUrl = `${base}/auth/v1/.well-known/jwks.json`;
  if (remoteJwks && remoteJwksUrl === jwksUrl) return remoteJwks;
  let url: URL;
  try {
    url = new URL(jwksUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  remoteJwks = createRemoteJWKSet(url);
  remoteJwksUrl = jwksUrl;
  return remoteJwks;
}

/**
 * Request authentication. Users authenticate with a Supabase Auth access token
 * (`Authorization: Bearer`); there are no application-signed session cookies.
 */
class SDKServer {
  /**
   * Verify a Supabase Auth access token and return its subject (auth user id)
   * and verified email, or null when the token is missing/invalid.
   *
   * The signing path is chosen from the token header `alg`. Current Supabase
   * projects sign access tokens with ES256 (RS256 is accepted as well) and the
   * public key comes from `${supabaseUrl}/auth/v1/.well-known/jwks.json`.
   * Legacy HS256 tokens still use `SUPABASE_JWT_SECRET`.
   */
  async verifySupabaseToken(
    token: string
  ): Promise<{
    sub: string;
    email: string;
    provider: string | null;
    name: string | null;
    companyName: string | null;
    inviteToken: string | null;
  } | null> {
    if (!isNonEmptyString(token)) return null;

    let alg: string | undefined;
    try {
      alg = decodeProtectedHeader(token).alg;
    } catch (error) {
      console.warn("[Auth] Supabase token verification failed", authFailureDetail(error, token));
      return null;
    }

    try {
      const payload = await this.verifySupabaseJwt(token, alg);
      if (!payload) return null;
      const { email, app_metadata, user_metadata } = payload as Record<string, any>;
      if (!isNonEmptyString(payload.sub) || !isNonEmptyString(email)) return null;
      const provider = app_metadata?.provider;
      const pick = (value: unknown) => (isNonEmptyString(value) ? value.trim() : null);
      return {
        sub: payload.sub,
        email: email.toLowerCase(),
        provider: isNonEmptyString(provider) ? provider : null,
        name: pick(user_metadata?.name) ?? pick(user_metadata?.full_name),
        companyName: pick(user_metadata?.companyName),
        inviteToken: pick(user_metadata?.inviteToken),
      };
    } catch (error) {
      console.warn("[Auth] Supabase token verification failed", authFailureDetail(error, token));
      return null;
    }
  }

  /**
   * Returns the verified payload, or null when the matching key material is
   * not configured. Throws when the signature or audience check fails.
   */
  private async verifySupabaseJwt(token: string, alg: string | undefined) {
    if (alg === "HS256") {
      if (!ENV.supabaseJwtSecret) {
        console.warn("[Auth] Supabase token verification failed", "legacy HMAC secret is not configured");
        return null;
      }
      const { payload } = await jwtVerify(token, new TextEncoder().encode(ENV.supabaseJwtSecret), {
        algorithms: ["HS256"],
        audience: "authenticated",
      });
      return payload;
    }

    if (!isAsymmetricAlg(alg)) {
      console.warn(
        "[Auth] Supabase token verification failed",
        `unsupported algorithm ${safeAlgLabel(alg)}`
      );
      return null;
    }

    const jwks = supabaseRemoteJwks(ENV.supabaseUrl);
    if (!jwks) {
      console.warn("[Auth] Supabase token verification failed", "JWKS URL is not configured");
      return null;
    }
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["ES256", "RS256"],
      audience: "authenticated",
    });
    return payload;
  }

  private async authenticateSupabaseBearer(
    req: Request
  ): Promise<AuthenticatedUser | null> {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    const claims = await this.verifySupabaseToken(header.slice(7).trim());
    if (!claims) throw ForbiddenError("Invalid Supabase token");

    // Linked rows are found by authId; otherwise fall back to emailLower and
    // link it, unless that row already belongs to another auth user.
    let user = await db.getUserByAuthId(claims.sub);
    if (!user) {
      // Linking or creating a row trusts the email, so it must be confirmed in
      // Supabase first. This runs once per auth user, on first sign-in.
      if (!(await this.isSupabaseEmailConfirmed(claims.sub))) {
        throw ForbiddenError("Email address is not confirmed");
      }
      const byEmail = await db.getUserByEmailLower(claims.email);
      if (byEmail && byEmail.authId && byEmail.authId !== claims.sub) {
        throw ForbiddenError("User is linked to a different account");
      }
      user = byEmail ?? (await this.createSupabaseUser(claims));
    }
    if (!user) throw ForbiddenError("User not found");
    await db.linkUserAuthId(user.id, claims.sub, claims.provider);
    // Owner email stays an administrator even when an older row was saved as a
    // normal user. Vendor sync never changes an admin role.
    const owner = await db.promoteOwnerAdmin(user, claims.email);
    return db.synchronizeApprovedVendorLogin(owner, claims.email);
  }

  /**
   * First sign-in of a new Supabase account. createEmailUser applies the
   * owner-email admin promotion, approved-vendor access and a supplier setup
   * link (`inviteToken` from signup metadata) exactly as email signup did.
   */
  private async createSupabaseUser(
    claims: NonNullable<Awaited<ReturnType<SDKServer["verifySupabaseToken"]>>>
  ) {
    const params = {
      email: claims.email,
      emailLower: claims.email,
      passwordHash: null,
      name: claims.name,
      companyName: claims.companyName,
      authId: claims.sub,
      loginMethod: claims.provider,
    };
    try {
      await db.createEmailUser({ ...params, inviteToken: claims.inviteToken });
    } catch (error) {
      if (!claims.inviteToken) throw error;
      // A used or invalid setup link must not lock the person out of their
      // account; they get an ordinary account and can request a new link.
      console.warn("[Auth] Supplier setup link rejected at first sign-in", String(error));
      await db.createEmailUser(params);
    }
    return db.getUserByAuthId(claims.sub);
  }

  private async isSupabaseEmailConfirmed(authId: string): Promise<boolean> {
    if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) return false;
    try {
      const { data } = await axios.get(
        `${ENV.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(authId)}`,
        {
          headers: {
            apikey: ENV.supabaseServiceRoleKey,
            Authorization: `Bearer ${ENV.supabaseServiceRoleKey}`,
          },
          timeout: AXIOS_TIMEOUT_MS,
        }
      );
      return Boolean(data?.email_confirmed_at);
    } catch (error) {
      console.warn("[Auth] Supabase user lookup failed", String(error));
      return false;
    }
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const bearerUser = await this.authenticateSupabaseBearer(req);
    if (bearerUser) return bearerUser;

    throw ForbiddenError("Not signed in");
  }
}

/** Result of `sdk.authenticateRequest`. */
export type AuthenticatedUser = User;

export const sdk = new SDKServer();
