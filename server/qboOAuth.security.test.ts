import express from "express";
import type { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: null as null | { id: number; role: string; email: string },
  rows: [] as Array<{ id: number; role: string }>,
}));

vi.hoisted(() => {
  process.env.QBO_CLIENT_ID = "test-client-id";
  process.env.QBO_CLIENT_SECRET = "test-client-secret";
  process.env.QBO_ENVIRONMENT = "sandbox";
});

vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: async () => {
      if (!auth.user) throw new Error("unauthenticated");
      return auth.user;
    },
  },
}));

vi.mock("./db", () => ({
  getDb: async () => ({
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: async () => auth.rows,
      };
      return chain;
    },
    delete: () => ({ where: async () => undefined }),
  }),
}));

import { registerQboRoutes } from "./qboOAuth";
import { resetQboOauthStateForTests } from "./lib/qboOauthState";

function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}` });
    });
  });
}

describe("QuickBooks OAuth routes", () => {
  let server: Server;
  let baseUrl = "";

  beforeEach(async () => {
    resetQboOauthStateForTests();
    auth.user = null;
    auth.rows = [];
    const app = express();
    registerQboRoutes(app);
    const started = await listen(app);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(() => {
    server.close();
  });

  it("refuses connect, status, and disconnect without an admin session", async () => {
    expect((await fetch(`${baseUrl}/api/qbo/connect`)).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/qbo/status`)).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/qbo/disconnect`, { method: "POST" })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/qbo/callback?state=missing`)).status).toBe(403);
  });

  it("issues a session-bound state for an admin and rejects a mismatched callback", async () => {
    auth.user = { id: 15, role: "admin", email: "admin@example.com" };
    const connect = await fetch(`${baseUrl}/api/qbo/connect`, { headers: { Accept: "application/json", Authorization: "Bearer admin" } });
    expect(connect.status).toBe(200);
    const body = await connect.json() as { authorizeUrl: string };
    expect(body.authorizeUrl).toContain("state=");
    const cookie = connect.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("qbo_oauth_state=");
    const state = new URL(body.authorizeUrl).searchParams.get("state");
    const mismatch = await fetch(`${baseUrl}/api/qbo/callback?code=abc&state=not-the-state`, { headers: { cookie } });
    expect(mismatch.status).toBe(403);
    auth.rows = [{ id: 15, role: "user" }];
    const notAdmin = await fetch(`${baseUrl}/api/qbo/callback?code=abc&state=${state}`, { headers: { cookie } });
    expect(notAdmin.status).toBe(403);
  });

  it("lets an admin read status and disconnect", async () => {
    auth.user = { id: 15, role: "admin", email: "admin@example.com" };
    const status = await fetch(`${baseUrl}/api/qbo/status`, { headers: { Authorization: "Bearer admin" } });
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ connected: false });
    const disconnect = await fetch(`${baseUrl}/api/qbo/disconnect`, { method: "POST", headers: { Authorization: "Bearer admin" } });
    expect(disconnect.status).toBe(200);
    expect(await disconnect.json()).toEqual({ ok: true });
  });
});
