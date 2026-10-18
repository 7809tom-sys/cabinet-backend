import type { CookieOptions, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isLocalRequest(req: Request) {
  const hostname = req.hostname || "";
  return LOCAL_HOSTS.has(hostname) || isIpAddress(hostname);
}

function isSecureRequest(req: Request) {
  // In production (non-localhost), always treat as secure since the site
  // is served over HTTPS. This ensures SameSite=None cookies work correctly
  // on all browsers including Edge, which rejects SameSite=None without Secure.
  if (!isLocalRequest(req)) return true;

  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  return {
    // Host-only is intentional. A login on one affiliate website must never
    // replace or authenticate a different affiliate website in the same
    // browser. Omitting `domain` scopes this cookie to the exact hostname
    // that issued it, including custom affiliate domains.
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req),
  };
}

/**
 * Retire only the old `.cabinetdealz.com` session cookie. It can coexist with
 * today's host-only cookie and be selected first by a browser, making a valid
 * new sign-in look anonymous. Custom affiliate domains intentionally remain
 * untouched so their sessions stay host-isolated.
 */
export function clearLegacyCabinetDealzParentSession(req: Request, res: Response) {
  const hostname = (req.hostname || req.headers.host || "").split(":")[0]?.toLowerCase() ?? "";
  if (hostname !== "cabinetdealz.com" && !hostname.endsWith(".cabinetdealz.com")) return;

  res.clearCookie(COOKIE_NAME, {
    ...getSessionCookieOptions(req),
    domain: ".cabinetdealz.com",
    maxAge: -1,
  });
}
