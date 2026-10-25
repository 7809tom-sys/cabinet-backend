import type { Request, Response, NextFunction } from "express";

/**
 * Decide whether a naked/apex host should be redirected to its www subdomain,
 * and return the absolute https target if so.
 *
 * Rules (kept intentionally conservative so we never break dev/preview):
 *  - Only acts on the exact apex we own: `cabinetdealz.com`.
 *  - Leaves `www.cabinetdealz.com` (already correct) untouched.
 *  - Leaves localhost / 127.0.0.1 / *.manus.space preview hosts untouched.
 *  - Preserves the original path + query string.
 *
 * @param hostHeader  The incoming Host header (may include a :port).
 * @param originalUrl The original request URL (path + query).
 * @returns absolute redirect URL, or null when no redirect should happen.
 */
export function resolveApexRedirect(
  hostHeader: string | undefined,
  originalUrl: string
): string | null {
  if (!hostHeader) return null;

  // Strip any port (e.g. "cabinetdealz.com:3000" -> "cabinetdealz.com").
  const host = hostHeader.split(":")[0].trim().toLowerCase();
  if (!host) return null;

  // Never touch local dev or Manus preview/deploy hosts.
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".manus.space") ||
    host.endsWith(".manus.computer")
  ) {
    return null;
  }

  // Only redirect the exact apex we own.
  if (host === "cabinetdealz.com") {
    const path = originalUrl && originalUrl.startsWith("/") ? originalUrl : "/";
    return `https://www.cabinetdealz.com${path}`;
  }

  return null;
}

/**
 * Express middleware that 301-redirects the naked apex domain to www.
 * A no-op for every other host, so it is safe to mount globally.
 */
export function apexRedirectMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const target = resolveApexRedirect(req.headers.host, req.originalUrl);
  if (target) {
    res.redirect(301, target);
    return;
  }
  next();
}
