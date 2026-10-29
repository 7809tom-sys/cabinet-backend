import { SignJWT, jwtVerify } from "jose";

export const TEST_ACCOUNT_ISSUER = "cabinetdealz-test-accounts";
export const TEST_ACCOUNT_AUDIENCE = "test-account";
export const TEST_ACCOUNT_HEADER = "x-cd-test-account";

export type TestAccountUsername = "customer" | "contractor";

export type TestAccountProfile = {
  username: TestAccountUsername;
  email: string;
  name: string;
  role: "user" | "contractor";
  openId: string;
};

const ACCOUNTS: Record<TestAccountUsername, TestAccountProfile> = {
  customer: {
    username: "customer",
    email: "customer@cabinetdealz.test",
    name: "Test Customer",
    role: "user",
    openId: "test-account-customer",
  },
  contractor: {
    username: "contractor",
    email: "contractor@cabinetdealz.test",
    name: "Test Contractor",
    role: "contractor",
    openId: "test-account-contractor",
  },
};

/** Default off. Only the exact string "true" enables the test logins. */
export function testAccountsEnabled(flag: string | undefined): boolean {
  return flag === "true";
}

export function testAccountProfile(username: string): TestAccountProfile | null {
  if (username === "customer" || username === "contractor") return ACCOUNTS[username];
  return null;
}

export async function signTestAccountToken(userId: number, secret: string): Promise<string> {
  return new SignJWT({ purpose: "test-account" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(TEST_ACCOUNT_ISSUER)
    .setAudience(TEST_ACCOUNT_AUDIENCE)
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(new TextEncoder().encode(secret));
}

export async function readTestAccountUserId(token: string, secret: string): Promise<number | null> {
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: TEST_ACCOUNT_ISSUER,
      audience: TEST_ACCOUNT_AUDIENCE,
    });
    const id = Number(payload.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
