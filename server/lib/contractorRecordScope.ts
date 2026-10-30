import { TRPCError } from "@trpc/server";

type ScopeUser = { id: number; role: string };

/**
 * User id whose contractor records the caller may see.
 * A contractor always resolves to themselves. An admin must pass contractorUserId.
 * Returns null when an admin omits it so house/admin views stay unchanged.
 */
export function contractorRecordUserId(user: ScopeUser, contractorUserId?: number): number | null {
  if (contractorUserId != null && user.role !== "admin" && contractorUserId !== user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an admin can view another contractor's records.",
    });
  }
  if (contractorUserId != null && user.role !== "admin" && user.role !== "contractor") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an admin can view another contractor's records.",
    });
  }
  if (user.role === "admin") return contractorUserId ?? null;
  if (user.role === "contractor") return user.id;
  return null;
}

export function requireContractorRecordUserId(user: ScopeUser, contractorUserId?: number): number {
  if (user.role !== "admin" && user.role !== "contractor") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Approved contractor access is required.",
    });
  }
  const ownerId = contractorRecordUserId(user, contractorUserId);
  if (ownerId == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Pass contractorUserId to view a contractor's records.",
    });
  }
  return ownerId;
}
