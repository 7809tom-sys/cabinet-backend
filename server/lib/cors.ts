import type { Request, RequestHandler } from "express";

/**
 * CORS for the split deployment: the frontend (Vercel) calls this API (Railway)
 * from another origin. Authentication is an `Authorization: Bearer` header, so
 * only the origins listed here may read responses.
 *
 * CORS_ALLOWED_ORIGINS is a comma-separated list of exact origins
 * (`https://www.cabinetdealz.com`) or wildcard hosts (`https://*.cabinetdealz.com`,
 * which matches any subdomain but not the bare domain).
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean);
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export function isOriginAllowed(
  origin: string | undefined,
  allowed: string[],
  allowLocal: boolean,
): boolean {
  if (!origin) return false;
  const normalized = origin.trim().replace(/\/+$/, "").toLowerCase();
  if (allowLocal && LOCAL_ORIGIN.test(normalized)) return true;
  return allowed.some((entry) => {
    if (!entry.includes("*.")) return entry === normalized;
    // https://*.example.com  ->  scheme "https://", suffix ".example.com"
    const [scheme, hostPattern] = entry.split("://");
    const suffix = hostPattern.replace(/^\*/, "");
    const [originScheme, originHost] = normalized.split("://");
    return (
      scheme === originScheme &&
      originHost.endsWith(suffix) &&
      originHost.length > suffix.length &&
      // wildcard matches a single label only; no dots, so no spoofed deeper hosts
      !originHost.slice(0, -suffix.length).includes(".")
    );
  });
}

const PREFLIGHT_MAX_AGE_SECONDS = 86400;

export function corsMiddleware(
  options: { allowedOrigins?: string; allowLocal?: boolean } = {},
): RequestHandler {
  const allowed = parseAllowedOrigins(options.allowedOrigins ?? process.env.CORS_ALLOWED_ORIGINS);
  const allowLocal = options.allowLocal ?? process.env.NODE_ENV !== "production";

  return (req: Request, res, next) => {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin, allowed, allowLocal)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.append("Vary", "Origin");
      if (req.method === "OPTIONS" && req.headers["access-control-request-method"]) {
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          req.headers["access-control-request-headers"] ?? "authorization,content-type",
        );
        res.setHeader("Access-Control-Max-Age", String(PREFLIGHT_MAX_AGE_SECONDS));
        res.status(204).end();
        return;
      }
    } else if (origin) {
      res.append("Vary", "Origin");
    }
    next();
  };
}
