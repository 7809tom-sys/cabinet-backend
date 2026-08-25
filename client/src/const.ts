export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Social providers offered through the Manus OAuth portal. The portal itself
 * supports Google / Apple / Microsoft / GitHub / email; we pass a hint so the
 * right provider is preselected when the user clicks a specific button. The
 * hint is advisory — if the portal ignores it, the user simply picks their
 * provider on the portal screen, so this is always safe.
 */
export type LoginProvider = "google" | "apple" | "microsoft" | "github" | "email";

// Titan-hosted webmail for the cabinetdealz.com mailboxes (sales@, etc.).
// The admin panel links to this so staff can open the real inbox in a new tab
// instead of the app trying to embed a full email client.
export const WEBMAIL_URL = "https://app.titan.email";

export function isSafeSiteReturnPath(value: string | null | undefined): value is string {
  return Boolean(
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/signin") &&
    !value.startsWith("/api/oauth/")
  );
}

export function getSiteSignInUrl(returnTo?: string): string {
  const currentPath = returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const url = new URL("/signin", window.location.origin);
  if (isSafeSiteReturnPath(currentPath)) url.searchParams.set("returnTo", currentPath);
  return `${url.pathname}${url.search}`;
}

// Ordinary sign-in always stays on CabinetDealz. Explicit social-provider
// buttons remain opt-in and use the hosted OAuth broker because those providers
// require that secure exchange.
export const getLoginUrl = (provider?: LoginProvider) => {
  if (!provider) return getSiteSignInUrl();

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  // Preserve the page that initiated sign-in. This is especially important for
  // white-label affiliate storefront footers: an authenticated visitor returns
  // to that affiliate store rather than the generic platform home.
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const state = btoa(JSON.stringify({ redirectUri, returnTo }));

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  // Common hint keys the portal may honor; harmless if unrecognized.
  url.searchParams.set("provider", provider);
  url.searchParams.set("loginMethod", provider);

  return url.toString();
};
