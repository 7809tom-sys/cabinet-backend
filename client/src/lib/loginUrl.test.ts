import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// getLoginUrl reads window.location.origin and import.meta.env at call time, so
// it must work on localhost, the *.manus.space preview, AND a custom domain
// without code changes. These tests lock in the URL shape + provider hint.

const ORIGIN = "https://cabinetdeals.com";

describe("getLoginUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: ORIGIN } });
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "https://portal.manus.im");
    vi.stubEnv("VITE_APP_ID", "app_123");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load() {
    // Import fresh so the stubbed env/window are picked up.
    const mod = await import("@/const");
    return mod.getLoginUrl;
  }

  it("builds a portal URL pointed back at the current origin", async () => {
    const getLoginUrl = await load();
    const u = new URL(getLoginUrl());
    expect(u.origin + u.pathname).toBe("https://portal.manus.im/app-auth");
    expect(u.searchParams.get("appId")).toBe("app_123");
    expect(u.searchParams.get("redirectUri")).toBe(`${ORIGIN}/api/oauth/callback`);
    expect(u.searchParams.get("type")).toBe("signIn");
    // state is the base64 of the redirect URI so the callback can restore it.
    expect(atob(u.searchParams.get("state")!)).toBe(`${ORIGIN}/api/oauth/callback`);
  });

  it("omits the provider hint when none is given", async () => {
    const getLoginUrl = await load();
    const u = new URL(getLoginUrl());
    expect(u.searchParams.get("provider")).toBeNull();
    expect(u.searchParams.get("loginMethod")).toBeNull();
  });

  it("passes a provider hint (provider + loginMethod) when specified", async () => {
    const getLoginUrl = await load();
    for (const p of ["google", "apple", "microsoft"] as const) {
      const u = new URL(getLoginUrl(p));
      expect(u.searchParams.get("provider")).toBe(p);
      expect(u.searchParams.get("loginMethod")).toBe(p);
    }
  });
});
