import { describe, expect, it, vi, beforeEach } from "vitest";

// We test the route handler in isolation by capturing the function registered
// on the Express app, then invoking it with mock req/res objects. This lets us
// assert the *graceful redirect* behavior (no raw 500 JSON page) that protects
// prospects during a launch.

// Mock the SDK so no real network calls happen.
vi.mock("./_core/sdk", () => ({
  sdk: {
    exchangeCodeForToken: vi.fn(),
    getUserInfo: vi.fn(),
    createSessionToken: vi.fn(),
  },
}));

vi.mock("./db", () => ({
  upsertUser: vi.fn(async () => undefined),
  getUserByOpenId: vi.fn(async () => undefined),
  getDb: vi.fn(async () => undefined),
}));

import { registerOAuthRoutes } from "./_core/oauth";
import { sdk } from "./_core/sdk";
import * as db from "./db";

type Handler = (req: any, res: any) => Promise<void> | void;

function captureHandler(): Handler {
  let handler: Handler | null = null;
  const fakeApp = {
    get: (_path: string, h: Handler) => {
      handler = h;
    },
  } as any;
  registerOAuthRoutes(fakeApp);
  if (!handler) throw new Error("handler not registered");
  return handler;
}

function mockRes() {
  const calls: { redirect?: [number, string]; status?: number; json?: unknown } = {};
  const res: any = {
    redirect: (code: number, url: string) => {
      calls.redirect = [code, url];
    },
    status: (code: number) => {
      calls.status = code;
      return res;
    },
    json: (body: unknown) => {
      calls.json = body;
      return res;
    },
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  };
  return { res, calls };
}

describe("OAuth callback hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects home with an error flag when code/state are missing (no JSON 500)", async () => {
    const handler = captureHandler();
    const { res, calls } = mockRes();

    await handler({ query: {} }, res);

    expect(calls.redirect?.[0]).toBe(302);
    expect(calls.redirect?.[1]).toContain("/?auth_error=");
    expect(calls.json).toBeUndefined();
  });

  it("redirects home gracefully when token exchange throws (never a dead error page)", async () => {
    (sdk.exchangeCodeForToken as any).mockRejectedValueOnce(
      Object.assign(new Error("bad redirect_uri"), {
        response: { status: 400, data: { msg: "redirect_uri_mismatch" } },
      })
    );
    const handler = captureHandler();
    const { res, calls } = mockRes();

    await handler({ query: { code: "abc", state: "xyz" } }, res);

    expect(calls.redirect?.[0]).toBe(302);
    expect(calls.redirect?.[1]).toContain("/?auth_error=exchange_failed");
    expect(calls.json).toBeUndefined();
  });

  it("sets the session cookie and redirects home on success", async () => {
    (sdk.exchangeCodeForToken as any).mockResolvedValueOnce({ accessToken: "tok" });
    (sdk.getUserInfo as any).mockResolvedValueOnce({ openId: "user-1", name: "Pat" });
    (sdk.createSessionToken as any).mockResolvedValueOnce("session-jwt");

    const handler = captureHandler();
    const { res, calls } = mockRes();

    await handler(
      { query: { code: "abc", state: "xyz" }, protocol: "https", hostname: "www.cabinetdealz.com", headers: {} },
      res
    );

    expect(res.cookie).toHaveBeenCalledOnce();
    expect(res.clearCookie).toHaveBeenCalledWith("app_session_id", expect.objectContaining({
      domain: ".cabinetdealz.com",
      maxAge: -1,
    }));
    expect(calls.redirect?.[0]).toBe(302);
    expect(calls.redirect?.[1]).toBe("/");
  });

  it("returns an affiliate management sign-in to the affiliate entry path on success", async () => {
    (sdk.exchangeCodeForToken as any).mockResolvedValueOnce({ accessToken: "tok" });
    (sdk.getUserInfo as any).mockResolvedValueOnce({ openId: "reaves-user", name: "Reaves User", email: "marcussmithreaves@gmail.com" });
    (sdk.createSessionToken as any).mockResolvedValueOnce("session-jwt");
    const state = Buffer.from(JSON.stringify({
      redirectUri: "https://www.cabinetdealz.com/api/oauth/callback",
      returnTo: "/affiliate",
    })).toString("base64");

    const handler = captureHandler();
    const { res, calls } = mockRes();
    await handler({ query: { code: "abc", state }, protocol: "https", headers: {} }, res);

    expect(res.cookie).toHaveBeenCalledOnce();
    expect(calls.redirect).toEqual([302, "/affiliate"]);
  });

  it("sends a recognized affiliate Gmail user directly to their Administration route", async () => {
    (sdk.exchangeCodeForToken as any).mockResolvedValueOnce({ accessToken: "tok" });
    (sdk.getUserInfo as any).mockResolvedValueOnce({ openId: "reaves-user", name: "Reaves User", email: "marcussmithreaves@gmail.com" });
    (sdk.createSessionToken as any).mockResolvedValueOnce("session-jwt");
    (db.getUserByOpenId as any).mockResolvedValueOnce({ id: 31, email: "marcussmithreaves@gmail.com" });
    (db.getDb as any).mockResolvedValueOnce({
      select: () => ({ from: async () => [{ id: 7, userId: 31, email: "marcussmithreaves@gmail.com", status: "active" }] }),
    });
    const state = Buffer.from(JSON.stringify({ returnTo: "/affiliate" })).toString("base64");

    const handler = captureHandler();
    const { res, calls } = mockRes();
    await handler({ query: { code: "abc", state }, protocol: "https", headers: {} }, res);

    expect(calls.redirect).toEqual([302, "/affiliate?viewAs=7"]);
  });
});
