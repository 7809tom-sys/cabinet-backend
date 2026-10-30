import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserByAuthId: vi.fn(),
  getUserByEmailLower: vi.fn(),
  linkUserAuthId: vi.fn(),
  promoteOwnerAdmin: vi.fn(async (user: { id: number }) => user),
  synchronizeApprovedVendorLogin: vi.fn(async (user: { id: number }) => user),
  assignSignupAffiliateOnce: vi.fn(),
  createEmailUser: vi.fn(),
  linkApprovedContractorAccess: vi.fn(
    async (_db: unknown, user: { id: number }) => user
  ),
}));

vi.mock("../db", () => mocks);
vi.mock("../lib/contractorAccessGrant", () => ({
  linkApprovedContractorAccess: mocks.linkApprovedContractorAccess,
}));

const SECRET = "signup-stamp-test-secret";

function storeLookup(mode: "ok" | "throw") {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (mode === "throw") {
              throw Object.assign(
                new Error("Failed query: select `slug` from `affiliates`"),
                {
                  cause: {
                    code: "ER_BAD_FIELD_ERROR",
                    errno: 1054,
                    sqlMessage: "Unknown column 'slug' in 'field list'",
                  },
                }
              );
            }
            return [{ id: 9, status: "active" }];
          },
        }),
      }),
    }),
  };
}

async function token() {
  return new SignJWT({
    email: "ada@example.com",
    user_metadata: { storeScope: "ada-store" },
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("auth-ada")
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(SECRET));
}

async function loadSdk() {
  vi.resetModules();
  process.env.SUPABASE_JWT_SECRET = SECRET;
  const { sdk } = await import("./sdk");
  return sdk;
}

describe("authenticateRequest signup stamp", () => {
  const user = {
    id: 15,
    role: "user",
    email: "ada@example.com",
    authId: "auth-ada",
    openId: "open-ada",
  };

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SUPABASE_JWT_SECRET;
  });

  it("returns the signed-in user when the affiliate stamp throws", async () => {
    mocks.getUserByAuthId.mockResolvedValue(user);
    mocks.linkUserAuthId.mockResolvedValue(undefined);
    mocks.getDb.mockResolvedValue(storeLookup("ok"));
    mocks.assignSignupAffiliateOnce.mockRejectedValue(
      new Error("Unknown column 'signupAffiliateId' in 'field list'")
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sdk = await loadSdk();
    const bearer = await token();
    const signedIn = await sdk.authenticateRequest({
      headers: { authorization: `Bearer ${bearer}` },
    } as never);
    expect(signedIn).toMatchObject({ id: 15, email: "ada@example.com" });
    expect(spy).toHaveBeenCalledWith(
      "[Auth] signup affiliate stamp failed",
      "Unknown column 'signupAffiliateId' in 'field list'"
    );
    expect(mocks.linkApprovedContractorAccess).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns the signed-in user when the store lookup throws", async () => {
    mocks.getUserByAuthId.mockResolvedValue(user);
    mocks.linkUserAuthId.mockResolvedValue(undefined);
    mocks.getDb.mockResolvedValue(storeLookup("throw"));
    mocks.assignSignupAffiliateOnce.mockResolvedValue(undefined);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sdk = await loadSdk();
    const bearer = await token();
    const signedIn = await sdk.authenticateRequest({
      headers: { authorization: `Bearer ${bearer}` },
    } as never);
    expect(signedIn).toMatchObject({ id: 15 });
    expect(mocks.assignSignupAffiliateOnce).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      "[Auth] signup affiliate stamp failed",
      "Unknown column 'slug' in 'field list'"
    );
    spy.mockRestore();
  });
});
