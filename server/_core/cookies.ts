import type { CookieOptions, Request } from "express";

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
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req),
  };
}
