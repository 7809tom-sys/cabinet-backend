import { AXIOS_TIMEOUT_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios from "axios";
import type { Request } from "express";
import { jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/**
 * Request authentication. Users authenticate with a Supabase Auth access token
 * (`Authorization: Bearer`); there are no application-signed session cookies.
 */
class SDKServer {
  /**
   * Verify a Supabase Auth access token and return its subject (auth user id)
   * and verified email, or null when the token is missing/invalid.
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
    if (!ENV.supabaseJwtSecret) return null;
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(ENV.supabaseJwtSecret),
        { algorithms: ["HS256"], audience: "authenticated" }
      );
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
      console.warn("[Auth] Supabase token verification failed", String(error));
      return null;
    }
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
    // A vendor might have been approved after creating a normal account; this
    // never changes admin or affiliate roles.
    return db.synchronizeApprovedVendorLogin(user, claims.email);
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
