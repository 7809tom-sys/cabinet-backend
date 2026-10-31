/**
 * Designer notice for published items that sit in Cabinet Conflict.
 *
 * Published items in Cabinet Conflict stay usable in the Designer. Admins (only)
 * get a dismissible, non-blocking pop-up when one is placed, so they can fix it
 * in Admin > Cabinet Conflict without losing their design.
 */
export const CABINET_CONFLICT_NOTICE_TEXT =
  "This item is in Cabinet Conflict. Please go to Cabinet Conflict to rectify it. You can keep using it in this design as needed.";

/** Statuses that appear in Admin > Cabinet Conflict (see catalog.conflicts). */
export const CABINET_CONFLICT_STATUSES = ["conflict", "review"] as const;

export function isInCabinetConflict(cabinet: { conflictStatus?: string | null } | null | undefined): boolean {
  return !!cabinet?.conflictStatus && (CABINET_CONFLICT_STATUSES as readonly string[]).includes(cabinet.conflictStatus);
}

/** Admins only (role === "admin"); everyone else never sees the notice. */
export function shouldShowCabinetConflictNotice(
  user: { role?: string | null } | null | undefined,
  cabinet: { conflictStatus?: string | null } | null | undefined,
): boolean {
  return user?.role === "admin" && isInCabinetConflict(cabinet);
}

/** Link to the item in Admin > Cabinet Conflict. */
export function cabinetConflictAdminHref(masterCode: string): string {
  return `/admin?tab=conflicts&item=${encodeURIComponent(masterCode.trim())}`;
}

/** Adds a master code once; a dismissed or already-shown code is not stacked again. */
export function addConflictNotice(current: readonly string[], masterCode: string): string[] {
  const code = masterCode.trim();
  return !code || current.includes(code) ? [...current] : [...current, code];
}
