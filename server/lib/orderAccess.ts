import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256-bit guest credential. base64url is 43 characters and fits varchar(64). */
export function generateOrderAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Compare an order access token without leaking the stored value through an
 * early length or equality return. Both sides are hashed to a fixed digest
 * first so `timingSafeEqual` always runs, including when one side is missing
 * or a different length.
 */
export function orderAccessTokenMatches(
  stored: string | null | undefined,
  provided: string | null | undefined
): boolean {
  const storedDigest = createHash("sha256")
    .update(stored ?? "", "utf8")
    .digest();
  const providedDigest = createHash("sha256")
    .update(provided ?? "", "utf8")
    .digest();
  const equal = timingSafeEqual(storedDigest, providedDigest);
  const bothPresent = Boolean(stored) && Boolean(provided);
  return bothPresent && equal;
}

type OrderOwner = {
  userId: number | null;
  accessToken?: string | null;
};

type Reader =
  | {
      id: number;
      openId?: string | null;
      role?: string | null;
    }
  | null
  | undefined;

/**
 * An order detail is readable by an admin, the signed-in owner (same user id
 * or the same openId as the order's user), or a holder of that order's
 * unguessable access token. Guest orders have a null user id, so the token is
 * their confirmation credential. Orders created before the token column exist
 * have a null token and stay readable only after sign-in as the owner.
 */
export async function callerCanReadOrder(
  user: Reader,
  order: OrderOwner,
  accessToken: string | undefined,
  ownerOpenId: (userId: number) => Promise<string | null | undefined>
): Promise<boolean> {
  if (user?.role === "admin") return true;
  if (user && order.userId != null && user.id === order.userId) return true;
  if (user?.openId && order.userId != null && user.id !== order.userId) {
    const openId = await ownerOpenId(order.userId);
    if (openId && openId === user.openId) return true;
  }
  return orderAccessTokenMatches(order.accessToken, accessToken);
}
