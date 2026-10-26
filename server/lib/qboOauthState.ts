import { randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

type PendingQboOauth = { userId: number; expiresAt: number };

const pending = new Map<string, PendingQboOauth>();

export const QBO_OAUTH_STATE_COOKIE = "qbo_oauth_state";

function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** One-time OAuth state bound to the admin user who started the connect flow. */
export function issueQboOauthState(userId: number, now = Date.now()): string {
  const state = randomBytes(32).toString("base64url");
  pending.set(state, { userId, expiresAt: now + STATE_TTL_MS });
  return state;
}

export function consumeQboOauthState(state: string, cookieState: string | undefined, now = Date.now()): { userId: number } | null {
  if (!cookieState || !secretsEqual(state, cookieState)) return null;
  const row = pending.get(state);
  pending.delete(state);
  if (!row || row.expiresAt <= now) return null;
  return { userId: row.userId };
}

export function resetQboOauthStateForTests(): void {
  pending.clear();
}
