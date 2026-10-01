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

  it("keeps ordinary sign-in on the CabinetDealz route", async () => {
    const getLoginUrl = await load();
    expect(getLoginUrl()).toBe("/signin");
  });

  it("preserves a safe current CabinetDealz page as the post-login return path", async () => {
    vi.stubGlobal("window", { location: { origin: ORIGIN, pathname: "/admin", search: "?tab=cabinet-attention", hash: "" } });
    const getLoginUrl = await load();
    expect(getLoginUrl()).toBe("/signin?returnTo=%2Fadmin%3Ftab%3Dcabinet-attention");
  });

  it("uses the hosted broker only for an explicitly selected connected provider", async () => {
    const getLoginUrl = await load();
    for (const p of ["google", "apple", "microsoft"] as const) {
      const u = new URL(getLoginUrl(p));
      expect(u.origin + u.pathname).toBe("https://portal.manus.im/app-auth");
      expect(u.searchParams.get("appId")).toBe("app_123");
      expect(u.searchParams.get("redirectUri")).toBe(`${ORIGIN}/api/oauth/callback`);
      expect(u.searchParams.get("type")).toBe("signIn");
      expect(u.searchParams.get("provider")).toBe(p);
      expect(u.searchParams.get("loginMethod")).toBe(p);
    }
  });

  it("preserves the original Designer destination when a connected sign-in starts from /signin", async () => {
    vi.stubGlobal("window", {
      location: {
        origin: ORIGIN,
        pathname: "/store/sales-demo/signin",
        search: "?returnTo=%2Fstore%2Fsales-demo%2Fdesign",
        hash: "",
      },
    });
    const getLoginUrl = await load();
    const url = new URL(getLoginUrl("google"));
    const state = JSON.parse(Buffer.from(url.searchParams.get("state") ?? "", "base64").toString("utf8"));
    expect(state.returnTo).toBe("/store/sales-demo/design");
  });

  it("rejects external and recursive return destinations", async () => {
    const mod = await import("@/const");
    expect(mod.isSafeSiteReturnPath("https://manus.im/login")).toBe(false);
    expect(mod.isSafeSiteReturnPath("//manus.im/login")).toBe(false);
    expect(mod.isSafeSiteReturnPath("/signin?again=1")).toBe(false);
    expect(mod.isSafeSiteReturnPath("/admin?tab=cabinet-attention")).toBe(true);
  });
});
