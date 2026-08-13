type OAuthStatePayload = { redirectUri?: unknown; returnTo?: unknown };

function isSafeRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/api/oauth/");
}

/**
 * The OAuth provider returns the opaque state unchanged. Decode the app's
 * return location defensively: only same-origin relative paths are accepted.
 * Legacy state values containing just a callback URL remain supported.
 */
export function resolveOAuthReturnPath(state: string | undefined): string {
  if (!state) return "/";
  try {
    const decoded = Buffer.from(state, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as OAuthStatePayload;
    if (typeof parsed.returnTo === "string" && isSafeRelativePath(parsed.returnTo)) {
      return parsed.returnTo;
    }
  } catch {
    // Older login links encode only the callback URL. They deliberately return home.
  }
  return "/";
}
