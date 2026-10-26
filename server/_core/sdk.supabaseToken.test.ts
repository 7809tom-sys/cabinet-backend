import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

const SUPABASE_URL = "https://project.supabase.co";
const VITE_ONLY_URL = "https://vite-only.supabase.co";
const LEGACY_SECRET = "legacy-hs256-secret";

const envSnapshot = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
};

function setEnv(name: "SUPABASE_URL" | "VITE_SUPABASE_URL" | "SUPABASE_JWT_SECRET", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function restoreEnv() {
  setEnv("SUPABASE_URL", envSnapshot.SUPABASE_URL);
  setEnv("VITE_SUPABASE_URL", envSnapshot.VITE_SUPABASE_URL);
  setEnv("SUPABASE_JWT_SECRET", envSnapshot.SUPABASE_JWT_SECRET);
}

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadSdk() {
  vi.resetModules();
  const { sdk } = await import("./sdk");
  return sdk;
}

function jwksUrl(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`;
}

function stubJwks(supabaseUrl: string, jwk: JWK) {
  const expected = jwksUrl(supabaseUrl);
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (href !== expected) {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function publicJwk(alg: "ES256" | "RS256", kid: string) {
  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.alg = alg;
  jwk.kid = kid;
  jwk.use = "sig";
  return { jwk, privateKey };
}

function signAccessToken(
  key: CryptoKey | Uint8Array,
  options: {
    alg: "ES256" | "RS256" | "HS256";
    kid?: string;
    sub?: string;
    audience?: string;
    email?: string;
  }
) {
  const header: { alg: string; typ: "JWT"; kid?: string } = { alg: options.alg, typ: "JWT" };
  if (options.kid) header.kid = options.kid;
  return new SignJWT({
    email: options.email ?? "Ada@Example.com",
    app_metadata: { provider: "google" },
    user_metadata: {
      full_name: "  Ada Lovelace  ",
      companyName: "Analytical Engines",
      inviteToken: "invite-1",
    },
  })
    .setProtectedHeader(header)
    .setSubject(options.sub ?? "user-123")
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience(options.audience ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(key);
}

describe("verifySupabaseToken JWKS", () => {
  it("verifies an ES256 access token from the mocked JWKS without the HMAC secret", async () => {
    const { jwk, privateKey } = await publicJwk("ES256", "es256-test");
    setEnv("SUPABASE_URL", SUPABASE_URL);
    setEnv("VITE_SUPABASE_URL", undefined);
    setEnv("SUPABASE_JWT_SECRET", undefined);
    const fetchMock = stubJwks(SUPABASE_URL, jwk);
    const sdk = await loadSdk();

    const token = await signAccessToken(privateKey, { alg: "ES256", kid: "es256-test" });
    await expect(sdk.verifySupabaseToken(token)).resolves.toEqual({
      sub: "user-123",
      email: "ada@example.com",
      provider: "google",
      name: "Ada Lovelace",
      companyName: "Analytical Engines",
      inviteToken: "invite-1",
    });

    const second = await signAccessToken(privateKey, {
      alg: "ES256",
      kid: "es256-test",
      sub: "user-456",
      email: "second@example.com",
    });
    await expect(sdk.verifySupabaseToken(second)).resolves.toMatchObject({
      sub: "user-456",
      email: "second@example.com",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(jwksUrl(SUPABASE_URL));
  });

  it("loads the JWKS from VITE_SUPABASE_URL when SUPABASE_URL is unset", async () => {
    const { jwk, privateKey } = await publicJwk("ES256", "vite-es256");
    setEnv("SUPABASE_URL", undefined);
    setEnv("VITE_SUPABASE_URL", `${VITE_ONLY_URL}/`);
    setEnv("SUPABASE_JWT_SECRET", "unused-legacy-secret");
    const fetchMock = stubJwks(VITE_ONLY_URL, jwk);
    const sdk = await loadSdk();

    const token = await signAccessToken(privateKey, { alg: "ES256", kid: "vite-es256" });
    await expect(sdk.verifySupabaseToken(token)).resolves.toMatchObject({
      sub: "user-123",
      email: "ada@example.com",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(jwksUrl(VITE_ONLY_URL));
  });

  it("verifies an RS256 access token against the same JWKS", async () => {
    const { jwk, privateKey } = await publicJwk("RS256", "rs256-test");
    setEnv("SUPABASE_URL", SUPABASE_URL);
    setEnv("VITE_SUPABASE_URL", undefined);
    setEnv("SUPABASE_JWT_SECRET", undefined);
    stubJwks(SUPABASE_URL, jwk);
    const sdk = await loadSdk();

    const token = await signAccessToken(privateKey, { alg: "RS256", kid: "rs256-test" });
    await expect(sdk.verifySupabaseToken(token)).resolves.toMatchObject({
      sub: "user-123",
      provider: "google",
    });
  });

  it("rejects a bad ES256 signature and does not log the token", async () => {
    const { jwk } = await publicJwk("ES256", "es256-test");
    const other = await publicJwk("ES256", "es256-test");
    setEnv("SUPABASE_URL", SUPABASE_URL);
    setEnv("VITE_SUPABASE_URL", undefined);
    setEnv("SUPABASE_JWT_SECRET", LEGACY_SECRET);
    stubJwks(SUPABASE_URL, jwk);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sdk = await loadSdk();

    const token = await signAccessToken(other.privateKey, { alg: "ES256", kid: "es256-test" });
    await expect(sdk.verifySupabaseToken(token)).resolves.toBeNull();
    const logged = warn.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
    expect(logged).toContain("[Auth] Supabase token verification failed");
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(token.split(".")[2]);
  });
});

describe("verifySupabaseToken legacy HS256", () => {
  it("verifies an HS256 token with SUPABASE_JWT_SECRET and does not fetch JWKS", async () => {
    setEnv("SUPABASE_URL", SUPABASE_URL);
    setEnv("VITE_SUPABASE_URL", undefined);
    setEnv("SUPABASE_JWT_SECRET", LEGACY_SECRET);
    const fetchMock = vi.fn(async () => new Response("unused", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const sdk = await loadSdk();

    const token = await signAccessToken(new TextEncoder().encode(LEGACY_SECRET), {
      alg: "HS256",
      email: "Legacy@Example.com",
    });
    await expect(sdk.verifySupabaseToken(token)).resolves.toEqual({
      sub: "user-123",
      email: "legacy@example.com",
      provider: "google",
      name: "Ada Lovelace",
      companyName: "Analytical Engines",
      inviteToken: "invite-1",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an HS256 token signed with a different secret and does not log it", async () => {
    setEnv("SUPABASE_URL", SUPABASE_URL);
    setEnv("VITE_SUPABASE_URL", undefined);
    setEnv("SUPABASE_JWT_SECRET", LEGACY_SECRET);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sdk = await loadSdk();

    const token = await signAccessToken(new TextEncoder().encode("other-secret"), { alg: "HS256" });
    await expect(sdk.verifySupabaseToken(token)).resolves.toBeNull();
    const logged = warn.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
    expect(logged).toContain("[Auth] Supabase token verification failed");
    expect(logged).not.toContain(token);
  });

  it("rejects an HS256 token with the wrong audience and does not log it", async () => {
    setEnv("SUPABASE_JWT_SECRET", LEGACY_SECRET);
    setEnv("SUPABASE_URL", SUPABASE_URL);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sdk = await loadSdk();
    const token = await signAccessToken(new TextEncoder().encode(LEGACY_SECRET), {
      alg: "HS256",
      audience: "anon",
    });
    await expect(sdk.verifySupabaseToken(token)).resolves.toBeNull();
    const logged = warn.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
    expect(logged).toContain("JWTClaimValidationFailed");
    expect(logged).not.toContain(token);
  });
});
